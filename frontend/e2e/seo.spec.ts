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
  expect(sitemapDeb).toContain('<urlset')
  expect(sitemapDeb).toContain('/man/tar/1')
})

test('seo: man pages emit JSON-LD with CSP nonce', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const jsonLd = page.locator('head script[type="application/ld+json"][nonce]')
  await expect(jsonLd).toHaveCount(1)
  expect((await jsonLd.textContent()) ?? '').toContain('"@type":"TechArticle"')
})
