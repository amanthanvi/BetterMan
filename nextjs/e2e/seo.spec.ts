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

test('seo: a shared flag link unfurls as that option’s card, under the page’s canonical URL', async ({ page, request }) => {
  await page.goto('/tar/-c')
  await expect(page).toHaveURL(/\/man\/tar\/1\?flag=-c#opt-create$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/man\/tar\/1$/)
  const ogImage = page.locator('meta[property="og:image"]')
  await expect(ogImage).toHaveAttribute('content', /\/man\/tar\/1\/og\?flag=-c$/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'tar -c · tar(1) — BetterMan')
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', '-c, --create in tar(1)')

  const card = await request.get((await ogImage.getAttribute('content')) ?? '')
  expect(card.status()).toBe(200)
  expect(card.headers()['content-type']).toBe('image/png')
  expect(card.headers()['cache-control']).toBe('public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')

  // A flag the page does not define has no card, privately; anything that is not one flag
  // is dropped by the query allowlist before the route.
  const missing = await request.get('/man/tar/1/og?flag=-Q', { maxRedirects: 0 })
  expect(missing.status()).toBe(404)
  expect(missing.headers()['cache-control']).toBe('private, no-store')
  for (const flag of ['create', '--create=x']) {
    const res = await request.get(`/man/tar/1/og?flag=${encodeURIComponent(flag)}`, { maxRedirects: 0 })
    expect(res.status(), flag).toBe(308)
    expect(res.headers()['location'], flag).toBe('/man/tar/1/og')
  }
  await page.goto('/man/tar/1?flag=-Q')
  await expect(ogImage).toHaveAttribute('content', /\/man\/tar\/1\/og$/)
})

test('identity: the icons are the print-manual mark, declared on both renderers', async ({ page, request }) => {
  for (const path of ['/man/tar/1', '/']) {
    await page.goto(path)
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]'), path).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="apple-touch-icon"]'), path).toHaveAttribute('href', '/apple-touch-icon.png')
  }
  const svg = await (await request.get('/favicon.svg')).text()
  expect(svg).toContain('fill="#a3261b"')
  expect(svg).not.toContain('rx=')
  for (const path of ['/favicon.ico', '/favicon-16.png', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/betterman-mark.svg']) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
})
