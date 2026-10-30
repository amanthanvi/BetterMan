import { expect, test } from '@playwright/test'

// Translated manuals (#395): the seed promotes a German Debian release with tar(1)
// and a gtar(1) alias; gzip(1) has no German translation.

test('translations: ?lang=de serves the German page with its own canonical and hreflang alternates', async ({ page }) => {
  const response = await page.goto('/man/tar/1?lang=de')
  expect(response?.status()).toBe(200)
  await expect(page.locator('[data-bm-manual-text][lang="de"]')).toContainText('GNU tar speichert viele Dateien')
  // One `?lang=` drives both: German UI chrome (B9) around the German manual (#395).
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.locator('[data-bm-translation="translated"]')).toContainText('Deutsch-Übersetzung aus Debian, Paket manpages-de.')
  // Only the manual's text is German: BetterMan's labels keep the page's UI language.
  await expect(page.locator('article')).not.toHaveAttribute('lang', /.+/)
  await expect(page.locator('[data-bm-manual-text]').getByText('Ein Problem melden')).toHaveCount(0)
  await expect(page.getByText('Ein Problem melden')).toBeVisible()
  // Through B9's switch, so a remembered language does not send the reader straight back.
  await expect(page.locator('[data-bm-translation] a[hreflang="en"]')).toHaveAttribute('href', '/-/lang/en?to=%2Fman%2Ftar%2F1')
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', /\/man\/tar\/1\?lang=de$/)
  await expect(page.locator('head link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/man\/tar\/1$/)
  await expect(page.locator('head link[rel="alternate"][hreflang="de"]')).toHaveAttribute('href', /\/man\/tar\/1\?lang=de$/)
  await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', /\/man\/tar\/1$/)
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0)
})

test('translations: a page English lacks names only the languages that have it', async ({ page }) => {
  await page.goto('/man/nur-de/1?lang=de')
  await expect(page.locator('[data-bm-manual-text][lang="de"]')).toContainText('Diese Seite gibt es nur auf Deutsch.')
  await expect(page.locator('[data-bm-translation] a[hreflang="en"]')).toHaveCount(0)
  await expect(page.locator('head link[rel="alternate"][hreflang="de"]')).toHaveAttribute('href', /\/man\/nur-de\/1\?lang=de$/)
  await expect(page.locator('head link[rel="alternate"][hreflang="en"]')).toHaveCount(0)
  await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveCount(0)
})

test('translations: English pages stay unchanged, with no alternates in their HTML', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.locator('[data-bm-translation]')).toHaveCount(0)
  await expect(page.locator('[data-bm-manual-text]')).toHaveCount(0)
  await expect(page.locator('head link[rel="alternate"][hreflang]')).toHaveCount(0)
})

test('translations: a page the language lacks shows English with a note, canonical English and noindex', async ({ page }) => {
  const response = await page.goto('/man/gzip/1?lang=de')
  expect(response?.status()).toBe(200)
  await expect(page.locator('[data-bm-translation="missing"]')).toContainText('Debian liefert keine Übersetzung von gzip(1) (Deutsch)')
  await expect(page.locator('[data-bm-manual-text]')).toHaveCount(0)
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', /\/man\/gzip\/1$/)
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})

test('translations: a distro without manuals in the language says so, not that the distro lacks a translation', async ({ page }) => {
  await page.goto('/man/tar/1?distro=ubuntu&lang=de')
  const note = page.locator('[data-bm-translation="missing"]')
  await expect(note).toContainText('BetterMan hat noch keine Handbuchseiten auf Deutsch für Ubuntu')
  await expect(note).not.toContainText('liefert keine')
  // B9's rule for an English manual under a localized UI: noindex, canonical English.
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', /\/man\/tar\/1\?distro=ubuntu$/)
})

test('translations: a name-only URL resolves in the language first', async ({ page }) => {
  await page.goto('/man/nur-de?lang=de')
  await expect(page).toHaveURL(/\/man\/nur-de\/1\?lang=de$/)
  await expect(page.locator('[data-bm-manual-text][lang="de"]')).toContainText('Diese Seite gibt es nur auf Deutsch.')
})

test('translations: an alias and a name-only URL keep the language', async ({ page }) => {
  await page.goto('/man/gtar/1?lang=de')
  await expect(page).toHaveURL(/\/man\/tar\/1\?lang=de$/)
  await page.goto('/man/tar?lang=de')
  await expect(page).toHaveURL(/\/man\/tar\/1\?lang=de$/)
  await expect(page.locator('[data-bm-manual-text][lang="de"]')).toBeVisible()
})

test('translations: search lists German hits first and links them in German', async ({ page }) => {
  await page.goto('/search?q=tar&lang=de')
  const first = page.locator('main li').first()
  await expect(first.getByRole('link', { name: 'tar(1)' })).toHaveAttribute('href', '/man/tar/1?lang=de')
  await expect(first).toContainText('ein Archivierungsprogramm')
  await expect(page.locator('form[role="search"] input[name="lang"]')).toHaveValue('de')
})

test('translations: sitemaps list each translated route with its complete hreflang set', async ({ request }) => {
  const index = await (await request.get('/sitemap.xml')).text()
  expect(index).toContain('/sitemap-translations-debian.de.1.xml')
  const response = await request.get('/sitemap-translations-debian.de.1.xml')
  expect(response.status()).toBe(200)
  const xml = await response.text()
  expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  expect(xml).toMatch(/<loc>[^<]*\/man\/tar\/1\?lang=de<\/loc>/)
  expect(xml).toMatch(/<loc>[^<]*\/man\/tar\/1<\/loc>/)
  expect(xml).toMatch(/hreflang="de" href="[^"]*\/man\/tar\/1\?lang=de"/)
  expect(xml).toMatch(/hreflang="x-default" href="[^"]*\/man\/tar\/1"/)
  // One file per sitemap page: none past the last, none for a language without a release.
  expect((await request.get('/sitemap-translations-debian.de.2.xml')).status()).toBe(404)
  expect((await request.get('/sitemap-translations-debian.ja.1.xml')).status()).toBe(404)
})
