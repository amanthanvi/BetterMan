import { expect, test } from '@playwright/test'

test('seo: robots.txt + sitemaps exist', async ({ page }) => {
  const robotsRes = await page.goto('/robots.txt')
  expect(robotsRes?.status()).toBe(200)
  const robots = await page.locator('body').innerText()
  expect(robots).toContain('User-agent: *')
  expect(robots).toContain('Disallow: /api/')
  expect(robots).toContain('Sitemap:')

  const sitemapIndexRes = await page.goto('/sitemap.xml')
  expect(sitemapIndexRes?.status()).toBe(200)
  expect(sitemapIndexRes?.headers()['content-type'] ?? '').toContain('application/xml')
  const sitemapIndex = await page.locator('body').innerText()
  expect(sitemapIndex).toContain('<sitemapindex')
  expect(sitemapIndex).toContain('/sitemap-debian.xml')

  const sitemapDebRes = await page.goto('/sitemap-debian.xml')
  expect(sitemapDebRes?.status()).toBe(200)
  const sitemapDeb = await page.locator('body').innerText()
  expect(sitemapDeb).toContain('<sitemapindex')
  expect(sitemapDeb).toContain('/sitemap-debian-1.xml')

  const sitemapDebPageRes = await page.goto('/sitemap-debian-1.xml')
  expect(sitemapDebPageRes?.status()).toBe(200)
  const sitemapDebPage = await page.locator('body').innerText()
  expect(sitemapDebPage).toContain('<urlset')
  expect(sitemapDebPage).toContain('/man/tar/1')
})

test('seo: man pages emit JSON-LD as a data block, with no nonce to vary the cached HTML', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const jsonLd = page.locator('head script[type="application/ld+json"]')
  await expect(jsonLd).toHaveCount(1)
  await expect(jsonLd).not.toHaveAttribute('nonce')
  expect((await jsonLd.textContent()) ?? '').toContain('"@type":"TechArticle"')
})

test('csp: man pages run under a hash-only policy, other pages keep their nonce, and no page reports a violation', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  const consoleCsp: string[] = []
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) consoleCsp.push(msg.text())
  })

  for (const path of ['/man/tar/1', '/man/ta/9', '/man/printf']) {
    const response = await page.goto(path)
    const csp = response!.headers()['content-security-policy'] ?? ''
    expect(csp, path).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+';/)
    expect(csp, path).not.toMatch(/nonce|strict-dynamic|script-src[^;]*unsafe-inline/)
    await expect(page.locator('html')).toHaveAttribute('data-bm-hydrated', 'true')
    const html = await response!.text()
    // One executable inline script (the boot script), and no Next runtime.
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    expect(inline, path).toHaveLength(1)
    const digest = await page.evaluate(async (text) => {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
      return btoa(String.fromCharCode(...bytes))
    }, inline[0]!)
    expect(csp, path).toContain(`'sha256-${digest}'`)
    expect(html, path).not.toMatch(/<script[^>]*src="\/_next\//)
    expect(html, path).not.toContain('__NEXT_DATA__')
    expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations), path).toEqual([])
  }

  for (const path of ['/', '/search?q=tar']) {
    const response = await page.goto(path)
    expect(response!.headers()['content-security-policy'], path).toMatch(/'nonce-[^']+' 'strict-dynamic'/)
    await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations), path).toEqual([])
  }
  expect(consoleCsp).toEqual([])
})

test('seo: man page share image follows the served distro', async ({ page }) => {
  const ogImage = page.locator('meta[property="og:image"]')

  await page.goto('/man/tar/1?distro=ubuntu')
  await expect(ogImage).toHaveAttribute('content', /\/man\/tar\/1\/og\?distro=ubuntu$/)
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /\/man\/tar\/1\/og\?distro=ubuntu$/)
  const image = await page.request.get((await ogImage.getAttribute('content')) ?? '')
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toBe('image/png')

  // Arch has no seeded release, so the share image falls back to Debian with the page.
  await page.goto('/man/tar/1?distro=arch')
  await expect(ogImage).toHaveAttribute('content', /\/man\/tar\/1\/og$/)
})

test('seo: index-by-demand keeps long-tail HTML and alternate formats served but noindex', async ({ request }) => {
  const tail = '/man/foo%3A%3Abar/3pm'
  const html = await request.get(tail)
  expect(html.status()).toBe(200)
  expect(await html.text()).toMatch(/<meta name="robots" content="noindex, follow"/)
  const txt = await request.get(`${tail}.txt`)
  expect(txt.status()).toBe(200)
  expect(txt.headers()['x-robots-tag']).toBe('noindex, follow')
  expect(txt.headers()['link']).toContain('/man/foo%3A%3Abar/3pm>')
  const json = await request.get('/api/v1/man/foo%3A%3Abar/3pm')
  expect(json.status()).toBe(200)
  expect(json.headers()['x-robots-tag']).toBe('noindex, follow')
  expect((await json.json()).page.indexable).toBe(false)
  const og = await request.get(`${tail}/og`)
  expect(og.status()).toBe(200)
  expect(og.headers()['x-robots-tag']).toBe('noindex, follow')
  const sitemap = await request.get('/sitemap-debian-1.xml')
  const xml = await sitemap.text()
  expect(xml).toContain('/man/tar/1')
  expect(xml).not.toContain('foo%3A%3Abar')
  const indexed = await request.get('/man/tar/1')
  expect(await indexed.text()).toMatch(/<meta name="robots" content="index, follow"/)
})

test('seo: an unscored legacy edition keeps HTML, alternates and the full sitemap indexable', async ({ request }) => {
  const path = '/man/foo%3A%3Abar/3pm'
  const html = await request.get(`${path}?distro=macos`)
  expect(html.status()).toBe(200)
  expect(await html.text()).toMatch(/<meta name="robots" content="index, follow"/)
  const txt = await request.get(`${path}.txt?distro=macos`)
  expect(txt.status()).toBe(200)
  expect(txt.headers()['x-robots-tag']).toBe('index, follow')
  expect(txt.headers()['link']).toContain(`${path}?distro=macos>`)
  const json = await request.get(`/api/v1/man/foo%3A%3Abar/3pm?distro=macos`)
  expect(json.status()).toBe(200)
  expect(json.headers()['x-robots-tag']).toBeUndefined()
  expect((await json.json()).page.indexable).toBe(true)
  const og = await request.get(`${path}/og?distro=macos`)
  expect(og.status()).toBe(200)
  expect(og.headers()['x-robots-tag']).toBe('index, follow')
  const sitemap = await request.get('/sitemap-macos-1.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain(`${path}?distro=macos`)
})
