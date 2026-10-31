import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsScripts } from '../components/AnalyticsScripts'
import { analyticsBootScriptHash } from '../lib/analyticsBoot'
import { expect, test } from '@playwright/test'
import { waitForInteractiveShell } from './shortcuts'

test('analytics: palette opens and actual preference changes emit only aggregate events', async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { __events: events, va: (...args: unknown[]) => events.push(args) })
  })
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  const search = page.getByRole('button', { name: 'Search' })
  await search.click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  await search.click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Reading preferences', exact: true }).click()
  const size = page.getByRole('radiogroup', { name: 'Font size' })
  await size.getByRole('radio', { name: 'L', exact: true }).click()
  await size.getByRole('radio', { name: 'L', exact: true }).click()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  expect(await page.evaluate(() => Reflect.get(window, '__events'))).toEqual([
    ['event', { name: 'palette opened' }],
    ['event', { name: 'palette opened' }],
    ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
    ['event', { name: 'pref changed', data: { axis: 'fontSize' } }],
  ])
})

test('analytics: local production builds emit no script, bootstrap or intake', async ({ page }) => {
  const analytics: string[] = []
  page.on('request', (request) => {
    if (/\/(?:script\.js|view|event)$/.test(new URL(request.url()).pathname)) analytics.push(request.url())
  })
  for (const path of ['/', '/man/tar/1', '/search?q=secret']) {
    await page.goto(path)
    await expect(page.locator('script[src$="/script.js"]')).toHaveCount(0)
    expect(await page.locator('script:not([src])').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringContaining('beforeSend')]))
  }
  expect(analytics).toEqual([])
})

// Render the real production component into each renderer's local document response.
// The regular CI build stays analytics-disabled; all tracker/intake requests are intercepted.
for (const path of ['/', '/man/tar/1']) {
  for (const authorized of [true, false]) {
    test(`analytics: ${path} ${authorized ? 'sanitizes enabled tracking under CSP' : 'does not load a tracker if CSP blocks the bootstrap'}`, async ({ page }) => {
      const intake: Array<{ path: string; body: { type: string; url: string; name?: string } }> = []
      let scriptLoads = 0
      let nonce: string | undefined
      await page.addInitScript(() => {
        history.replaceState(null, '', `${location.pathname}?utm_source=hn&ref=home&q=private&cmd=secret#secret`)
        window.vaq = [['event', { name: 'palette opened' }]]
        const violations: string[] = []
        Reflect.set(window, '__analyticsCspViolations', violations)
        window.addEventListener('securitypolicyviolation', (event) => { violations.push(event.effectiveDirective) })
      })
      await page.route('**/__analytics-test/**', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname.endsWith('/script.js')) {
          scriptLoads++
          await route.fulfill({ contentType: 'application/javascript', body: `
            const script = document.currentScript;
            let beforeSend;
            const send = (type, payload) => {
              const event = beforeSend({ type, url: location.href });
              if (event) fetch(type === 'pageview' ? script.dataset.viewEndpoint : script.dataset.eventEndpoint, {
                method: 'POST', body: JSON.stringify({ ...payload, ...event })
              });
            };
            const queue = window.vaq || [];
            window.va = (command, payload) => {
              if (command === 'beforeSend') beforeSend = payload;
              else if (command === 'event') send('event', payload);
            };
            queue.forEach(args => window.va(...args));
            send('pageview', {});
          ` })
        } else {
          intake.push({ path: url.pathname, body: route.request().postDataJSON() })
          await route.fulfill({ status: 204 })
        }
      })
      await page.route((url) => url.pathname === path, async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue()
        const response = await route.fetch()
        const headers = response.headers()
        nonce = /'nonce-([^']+)'/.exec(headers['content-security-policy'])?.[1]
        expect(Boolean(nonce)).toBe(path === '/')
        const saved = { env: process.env.VERCEL_ENV, config: process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG }
        let bootstrap: string
        try {
          process.env.VERCEL_ENV = 'production'
          process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG = JSON.stringify({ analytics: {
            scriptSrc: '/__analytics-test/script.js', eventEndpoint: '/__analytics-test/event', viewEndpoint: '/__analytics-test/view',
          } })
          bootstrap = renderToStaticMarkup(AnalyticsScripts({ nonce: authorized ? nonce : undefined }))
        } finally {
          if (saved.env === undefined) delete process.env.VERCEL_ENV
          else process.env.VERCEL_ENV = saved.env
          if (saved.config === undefined) delete process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG
          else process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG = saved.config
        }
        if (authorized && !nonce) {
          const hash = await analyticsBootScriptHash()
          headers['content-security-policy'] = headers['content-security-policy'].replace(/(script-src(?:-elem)? [^;]+)/g, `$1 ${hash}`)
        }
        const html = await response.text()
        expect(html).toContain('<head>')
        await route.fulfill({ response, headers, body: html.replace('<head>', `<head>${bootstrap}`) })
      })
      await page.goto(path)
      if (!authorized) {
        await expect.poll(() => page.evaluate(() => Reflect.get(window, '__analyticsCspViolations'))).toContain('script-src-elem')
        expect(scriptLoads).toBe(0)
        expect(intake).toEqual([])
        return
      }
      await expect.poll(() => intake.length).toBe(2)
      const origin = new URL(page.url()).origin
      expect(intake).toEqual([
        { path: '/__analytics-test/event', body: { name: 'palette opened', type: 'event', url: `${origin}${path}?utm_source=hn&ref=home` } },
        { path: '/__analytics-test/view', body: { type: 'pageview', url: `${origin}${path}?utm_source=hn&ref=home` } },
      ])
      expect(scriptLoads).toBe(1)
      await expect(page.locator('head > script[src="/__analytics-test/script.js"]')).toHaveCount(1)
      expect(await page.locator('script[src="/__analytics-test/script.js"]').evaluate((script: HTMLScriptElement) => script.nonce)).toBe(nonce ?? '')
      expect(await page.evaluate(() => Reflect.get(window, '__analyticsCspViolations'))).toEqual([])
    })
  }
}
