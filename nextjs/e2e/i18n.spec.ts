import { expect, test, type Page } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { waitForInteractiveShell } from './shortcuts'

// UI localization (docs/i18n.md). The server under test shows the languages named in
// BM_I18N_PREVIEW before review (CI sets all but Russian); every other language is gated.
const previewed = new Set((process.env.BM_I18N_PREVIEW ?? '').split(',').map((lang) => lang.trim()).filter(Boolean))
const GATED = 'ru'
const shown = (lang: string) => previewed.has(lang)

const lang = (page: Page) => page.locator('html').getAttribute('lang')

test.describe('English is the default', () => {
  test('a bare URL, ?lang=en and an unknown ?lang= render English', async ({ page }) => {
    for (const url of ['/', '/?lang=en', '/?lang=klingon', '/man/tar/1', '/man/tar/1?lang=klingon']) {
      await page.goto(url)
      expect(await lang(page), url).toBe('en')
      await expect(page.getByText('Skip to content')).toBeAttached()
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0)
    }
  })

  test('an unreviewed language does not render: the parameter is ignored, the switch omits it, a remembered choice does not redirect', async ({ page, request }) => {
    await page.goto(`/man/tar/1?lang=${GATED}`)
    expect(await lang(page)).toBe('en')
    await expect(page.getByText('Skip to content')).toBeAttached()
    await expect(page.locator('script#bm-i18n')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0)
    await expect(page.locator('[data-bm-lang-nav] [lang="ru"]')).toHaveCount(0)

    const response = await request.get('/man/tar/1', { headers: { cookie: `bm-lang=${GATED}` }, maxRedirects: 0 })
    expect(response.status()).toBe(200)
    const home = await request.get('/', { headers: { cookie: `bm-lang=${GATED}`, accept: 'text/html' }, maxRedirects: 0 })
    expect(home.status()).toBe(200)
  })

  test('the gate holds for languages the build ships but has not reviewed', async ({ page }) => {
    for (const unreviewed of ['de', 'fr', 'es', 'pt-BR', 'ja', 'ru'].filter((code) => !shown(code))) {
      await page.goto(`/?lang=${unreviewed}`)
      expect(await lang(page), unreviewed).toBe('en')
    }
  })
})

test.describe('a language that may render', () => {
  test.skip(!shown('de'), 'needs BM_I18N_PREVIEW to include de')

  test('man page: translated chrome, the script’s strings, noindex and the English canonical', async ({ page }) => {
    await page.goto('/man/tar/1?lang=de')
    await waitForInteractiveShell(page)
    expect(await lang(page)).toBe('de')
    await expect(page.getByRole('banner', { name: 'Seitenkopf' })).toBeVisible()
    await expect(page.getByRole('contentinfo', { name: 'Seitenfuß' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Einstellungen zum Lesen' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/man\/tar\/1$/)
    // The manual itself is upstream text and stays as written.
    await expect(page.locator('[data-bm-manual]')).toContainText('tar')
    // The static script reads its strings from the page: no second locale is bundled.
    await page.getByRole('button', { name: 'In der Seite suchen' }).click()
    await expect(page.getByRole('textbox', { name: 'In der Seite suchen' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Einstellungen zum Lesen' }).click()
    const prefs = page.getByRole('dialog', { name: 'Leseeinstellungen' })
    await expect(prefs).toBeVisible()
    await expect(prefs.getByRole('radiogroup', { name: 'Standard-Distribution' })).toBeVisible()
  })

  test('app page: translated chrome and in-app links that keep the language', async ({ page }) => {
    await page.goto('/?lang=de')
    await waitForInteractiveShell(page)
    expect(await lang(page)).toBe('de')
    await expect(page.getByRole('search', { name: 'Handbuchseiten durchsuchen' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Abschnitte durchsuchen' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.getByRole('link', { name: 'Lizenzen' })).toHaveAttribute('href', /lang=de/)
    await page.getByRole('region', { name: 'Abschnitte durchsuchen' }).getByRole('link').first().click()
    await expect(page).toHaveURL(/\/section\/\d\?.*lang=de/)
    expect(await lang(page)).toBe('de')
    await expect(page.getByRole('navigation', { name: 'Abschnitte' })).toBeVisible()
    await page.getByRole('link', { name: 'Lizenzen' }).click()
    await expect(page).toHaveURL(/\/licenses\?.*lang=de/)
    await expect(page.getByRole('heading', { name: 'Lizenzen', level: 1 })).toBeVisible()
  })

  test('search and explain keep the language through their forms', async ({ page }) => {
    await page.goto('/search?q=tar&lang=de')
    await waitForInteractiveShell(page)
    await expect(page.getByRole('list', { name: 'Suchergebnisse' })).toBeVisible()
    await expect(page.locator('form[role="search"] input[name="lang"]')).toHaveValue('de')
    await page.goto('/explain?cmd=tar%20-xzf%20a.tgz&lang=de')
    await expect(page.getByRole('region', { name: 'Lesart' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Definitionen' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('a miss answers a real 404 in the language', async ({ page }) => {
    const response = await page.goto('/man/no-such-page-zz/1?lang=de')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kein Handbucheintrag für no-such-page-zz in Abschnitt 1')
    const app = await page.goto('/no/such/place?lang=de')
    expect(app?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Datei oder Verzeichnis nicht gefunden')
  })

  test('a localized page is its own cacheable page: the URL decides, never Accept-Language or a cookie', async ({ request }) => {
    const get = (headers: Record<string, string>, url = '/man/tar/1?lang=de') => request.get(url, { headers })
    const [plain, noisy] = [await get({}), await get({ 'accept-language': 'ja', cookie: 'bm-lang=fr' })]
    expect(await noisy.text()).toBe(await plain.text())
    for (const response of [plain, noisy]) {
      expect(response.headers()['cdn-cache-control']).toContain('s-maxage')
      expect(response.headers()['set-cookie']).toBeUndefined()
    }
    const english = await (await get({ 'accept-language': 'de' }, '/man/tar/1')).text()
    expect(english).toContain('Skip to content')
    expect(english).not.toContain('Zum Inhalt springen')
  })
})

test.describe('remembering a language', () => {
  test.skip(!shown('de'), 'needs BM_I18N_PREVIEW to include de')

  test('the footer switch remembers the choice, and a bare man page URL then goes to ?lang= privately', async ({ page, request, context }) => {
    await page.goto('/man/tar/1?distro=debian')
    await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Deutsch' }).click()
    // A plain link: the proxy sets the cookie on a private redirect back to this page, in German. No script involved.
    await expect(page).toHaveURL(/\/man\/tar\/1\?distro=debian&lang=de$/)
    expect((await context.cookies()).find((cookie) => cookie.name === 'bm-lang')?.value).toBe('de')

    // The reader's next visit to the bare URL.
    await page.goto('/man/tar/1')
    await expect(page).toHaveURL(/\/man\/tar\/1\?lang=de$/)
    expect(await lang(page)).toBe('de')

    // What the redirect looks like on the wire: a private 307 that no cache may keep.
    const redirect = await request.get('/man/tar/1', { headers: { cookie: 'bm-lang=de' }, maxRedirects: 0 })
    expect(redirect.status()).toBe(307)
    expect(new URL(redirect.headers()['location'], 'http://example.test').search).toBe('?lang=de')
    expect(redirect.headers()['cache-control']).toBe('private, no-store')
    expect(redirect.headers()['cdn-cache-control']).toBeUndefined()
    // Without the cookie the bare URL is the shared, cacheable English page.
    const bare = await request.get('/man/tar/1', { maxRedirects: 0 })
    expect(bare.status()).toBe(200)
    expect(bare.headers()['cdn-cache-control']).toContain('s-maxage')
  })

  test('English is the way back past a remembered language: an app page accepts ?lang=en, a man page drops it', async ({ page, request, baseURL }) => {
    const app = await request.get('/search?q=tar&lang=en', { headers: { cookie: 'bm-lang=de', accept: 'text/html' }, maxRedirects: 0 })
    expect(app.status()).toBe(200)
    // The man URL allowlist keeps English as the bare URL (lib/manQuery.ts), and /-/lang/en remembers it.
    const man = await request.get('/man/tar/1?lang=en', { headers: { cookie: 'bm-lang=de' }, maxRedirects: 0 })
    expect(man.status()).toBe(308)
    await page.context().addCookies([{ name: 'bm-lang', value: 'de', url: baseURL! }])
    await page.goto('/-/lang/en?to=%2Fman%2Ftar%2F1%3Flang%3Dde')
    await expect(page).toHaveURL(/\/man\/tar\/1$/)
    expect(await lang(page)).toBe('en')
  })

  test('an app page redirects the same way, and English is remembered like any language', async ({ page, request }) => {
    const redirect = await request.get('/search?q=tar', { headers: { cookie: 'bm-lang=de', accept: 'text/html' }, maxRedirects: 0 })
    expect(redirect.status()).toBe(307)
    expect(redirect.headers()['cache-control']).toBe('private, no-store')
    expect(new URL(redirect.headers()['location'], 'http://example.test').search).toBe('?q=tar&lang=de')

    await page.goto('/man/tar/1?lang=de')
    await page.getByRole('navigation', { name: 'Sprache' }).getByRole('link', { name: 'English' }).click()
    await expect(page).toHaveURL(/\/man\/tar\/1$/)
    expect(await lang(page)).toBe('en')
    // English is remembered: the bare URL stays English.
    await page.goto('/man/tar/1')
    await expect(page).toHaveURL(/\/man\/tar\/1$/)
    expect(await lang(page)).toBe('en')
  })

  test('the App Router footer switch remembers the language and returns to the page', async ({ page }) => {
    // The server renders this nav, and the link returns to the page the reader was on (the Referer).
    await page.goto('/search?q=tar')
    await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Deutsch' }).click()
    await expect(page).toHaveURL(/\/search\?q=tar&lang=de$/)
    expect(await lang(page)).toBe('de')
    expect((await page.context().cookies()).find((cookie) => cookie.name === 'bm-lang')?.value).toBe('de')
  })
})

test.describe('a fix for a translation', () => {
  test.skip(!shown('de'), 'needs BM_I18N_PREVIEW to include de')

  test('every localized page links a prefilled issue with the language and the page', async ({ page, request, baseURL }) => {
    await page.goto('/man/tar/1?lang=de')
    const manIssue = new URL((await page.getByRole('link', { name: 'Korrektur für diese Übersetzung vorschlagen' }).getAttribute('href'))!)
    expect(manIssue.pathname).toBe('/amanthanvi/BetterMan/issues/new')
    expect(manIssue.searchParams.get('template')).toBe('translation_fix.yml')
    expect(manIssue.searchParams.get('locale')).toBe('de')
    expect(manIssue.searchParams.get('page')).toContain('/man/tar/1')
    // App Router pages link the proxy, which opens the same issue for the page the reader came from.
    await page.goto('/search?q=tar&lang=de')
    await expect(page.getByRole('link', { name: 'Korrektur für diese Übersetzung vorschlagen' })).toHaveAttribute('href', '/-/fix/de')
    const fix = await request.get('/-/fix/de', { headers: { referer: `${baseURL}/search?q=tar&lang=de` }, maxRedirects: 0 })
    expect(fix.status()).toBe(307)
    const appIssue = new URL(fix.headers()['location'])
    expect(appIssue.searchParams.get('locale')).toBe('de')
    expect(appIssue.searchParams.get('page')).toBe('/search?q=tar&lang=de')
    await page.goto('/man/tar/1')
    await expect(page.getByText('Suggest a fix for this translation')).toHaveCount(0)
  })
})

test.describe('accessibility', () => {
  test.skip(!shown('de'), 'needs BM_I18N_PREVIEW to include de')

  test('localized pages have no serious violations', async ({ page }) => {
    for (const url of ['/man/tar/1?lang=de', '/?lang=de', '/search?q=tar&lang=de']) {
      await page.goto(url)
      await waitForInteractiveShell(page)
      await expectNoCriticalOrSeriousViolations(page)
    }
  })
})
