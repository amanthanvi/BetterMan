import { expect, test } from '@playwright/test'
import { waitForInteractiveShell } from './shortcuts'

test('analytics: palette opens and actual preference changes emit only aggregate events', async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = []
    Object.assign(window, { __events: events, plausible: (...args: unknown[]) => events.push(args) })
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
    ['palette opened', undefined],
    ['palette opened', undefined],
    ['pref changed', { props: { axis: 'fontSize' } }],
    ['pref changed', { props: { axis: 'fontSize' } }],
  ])
})

test('analytics: static tracker replays early events and counts SPA pageviews without engagement pings', async ({ page, request }) => {
  const script = await request.get('/assets/site.js')
  expect(script.status()).toBe(200)
  expect(script.headers()['x-content-type-options']).toBe('nosniff')
  expect(script.headers()['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'")
  expect(script.headers()['cache-control']).toContain('s-maxage=86400')
  const tracker = await script.text()
  const events: Array<{ n: string; u: string; p?: { axis: string } }> = []
  await page.addInitScript(() => {
    Reflect.set(window, '__plausible', true)
    // The real helper's standard queue format is covered by analytics.test.ts.
    Reflect.set(window, 'plausible', Object.assign(() => {}, { q: [['palette opened']] }))
  })
  await page.route('http://tracker.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/assets/site.js') {
      await route.fulfill({ contentType: 'application/javascript', body: tracker })
    } else if (path === '/assets/entry') {
      events.push(route.request().postDataJSON())
      await route.fulfill({ status: 202, body: '' })
    } else {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Tracker contract</title><script defer src="/assets/site.js" data-api="/assets/entry" data-domain="betterman.sh"></script>' })
    }
  })
  // A synthetic non-local origin exercises the unmodified tracker's localhost/webdriver guards.
  await page.goto('http://tracker.test/man/tar/1')
  await expect.poll(() => events.map((event) => event.n)).toEqual(['palette opened', 'pageview'])
  await page.evaluate(() => {
    history.pushState({}, '', '/man/grep/1')
    history.pushState({}, '', '/man/grep/1?q=does-not-create-a-pageview')
    window.plausible?.('pref changed', { props: { axis: 'fontSize' } })
    window.dispatchEvent(new Event('blur'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await expect.poll(() => events.map((event) => event.n)).toEqual(['palette opened', 'pageview', 'pageview', 'pref changed'])
  await page.waitForTimeout(1000)
  expect(events.map((event) => event.n)).toEqual(['palette opened', 'pageview', 'pageview', 'pref changed'])
  expect(events.filter((event) => event.n === 'pageview').map((event) => new URL(event.u).pathname)).toEqual(['/man/tar/1', '/man/grep/1'])
  expect(events.at(-1)?.p).toEqual({ axis: 'fontSize' })
})
