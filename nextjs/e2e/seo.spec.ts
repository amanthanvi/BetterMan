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

test('seo: man pages emit JSON-LD with CSP nonce', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const jsonLd = page.locator('head script[type="application/ld+json"][nonce]')
  await expect(jsonLd).toHaveCount(1)
  expect((await jsonLd.textContent()) ?? '').toContain('"@type":"TechArticle"')
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
