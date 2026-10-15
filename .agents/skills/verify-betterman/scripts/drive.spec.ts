import { expect, shellReady, shot, test } from './evidence'

test('home: empty recent and bookmarks, browse link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recent' })).toBeVisible()
  await expect(page.getByText('No recent pages')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Bookmarks' })).toBeVisible()
  await expect(page.getByText('No bookmarks yet')).toBeVisible()
  await shot(page, 'home')

  await page.getByRole('link', { name: /^1\s/i }).click()
  await expect(page).toHaveURL(/\/section\/1(\?|$)/)
  await expect(page).toHaveTitle(/Section\s+1/i)
  await shot(page, 'section')
})

test('search: results, typo, empty, hostile, and section filter', async ({ page }) => {
  page.on('dialog', () => {
    throw new Error('unexpected dialog')
  })

  await page.goto('/search')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  await page.getByRole('link', { name: 'tar', exact: true }).click()
  await expect(page).toHaveURL(/\/search\?q=tar/)
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
  await shot(page, 'search-tar')

  await page.goto('/search?q=tarr')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()

  await page.goto('/search?q=archiving')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()

  await page.goto('/search?q=xyzzyplugh')
  await expect(page.getByText('No results for')).toBeVisible()
  await expect(page.getByText('xyzzyplugh')).toBeVisible()
  await shot(page, 'search-empty')

  const hostile = '<script>alert(1)</script>'
  await page.goto(`/search?q=${encodeURIComponent(hostile)}`)
  await expect(page.getByText('No results for')).toBeVisible()
  await expect(page.getByText(hostile)).toBeVisible()
  await shot(page, 'search-hostile')

  await page.goto('/search?q=tar')
  await page.getByRole('link', { name: 'Section 3: Library Functions' }).click()
  await expect(page).toHaveURL(/section=3/)
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toHaveCount(0)

  const missing = await page.request.get('/api/v1/search')
  expect(missing.status()).toBe(400)
})

test('section: letter jump, in-section search, and a far offset', async ({ page }) => {
  await page.goto('/section/1')
  await expect(page.getByRole('navigation', { name: 'Jump to letter' })).toBeVisible()
  await page.getByRole('link', { name: 'T', exact: true }).click()
  await expect(page).toHaveURL(/#letter-t$/)
  await expect(page.getByRole('link', { name: /tar\(1\)/ })).toBeVisible()

  await page.getByRole('textbox', { name: 'Search within section' }).fill('gzip')
  await page.locator('form').getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/search\?section=1&q=gzip/)
  await expect(page.getByRole('link', { name: /gzip\(1\)/i })).toBeVisible()

  await page.goto('/section/1?offset=99999')
  await expect(page.getByText(/Showing 0 of/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'First page' })).toBeVisible()
})

test('man page: options, related, alias, ambiguous name, copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Command-line options' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Related commands' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'See also' })).toBeVisible()
  await shot(page, 'man-tar')

  await page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true }).click()
  await expect(page.locator('mark[data-bm-opt]').first()).toBeVisible()

  await page.getByRole('button', { name: 'Copy code block' }).first().click()
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('tar')

  await page.getByRole('button', { name: 'Copy link to clipboard' }).click()
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('/man/tar/1')

  await page.goto('/man/gunzip/1')
  await expect(page).toHaveURL(/\/man\/gzip\/1$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('gzip')

  await page.goto('/man/printf')
  await expect(page.getByRole('heading', { name: 'printf', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(1\)/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(3\)/i })).toBeVisible()
  await shot(page, 'man-ambiguous')

  await page.goto('/man/openssl/1ssl')
  await expect(page.getByRole('heading', { name: /openssl\(1ssl\)/i })).toBeVisible()

  await page.goto('/man/zzznnotapage')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await shot(page, 'man-missing')
})

test('find in page: count and next match', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  await page.getByRole('button', { name: 'Find in page' }).click()
  const findbar = page.locator('[data-bm-findbar]')
  await findbar.getByRole('textbox', { name: 'Find in page' }).fill('tar')
  await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()
  const count = findbar.getByText(/^\d+\/\d+$/)
  await expect(count).toHaveText(/^1\/\d+$/)
  await shot(page, 'find-tar')
  await findbar.getByRole('button', { name: 'Next match' }).click()
  await expect(count).toHaveText(/^2\/\d+$/)
  await findbar.getByRole('textbox', { name: 'Find in page' }).fill('zzzz-no-such-token')
  await expect(page.locator('mark[data-bm-find]')).toHaveCount(0)
})

test('toc: hash navigation and sidebar toggle', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  const sidebar = page.locator('[data-bm-sidebar]')
  const examples = sidebar.getByRole('link', { name: 'EXAMPLES' })
  await examples.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#examples$/)
  await expect(examples).toHaveAttribute('aria-current', 'location')
  await shot(page, 'toc')

  await page.keyboard.press('b')
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  await page.keyboard.press('b')
  await expect(sidebar.getByRole('navigation', { name: 'On this page' })).toBeVisible()
})

test('toc: mobile contents drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/man/tar/1')
  await page.getByRole('button', { name: 'Open contents' }).click()
  const dialog = page.getByRole('dialog', { name: 'Table of contents' })
  await expect(dialog).toBeVisible()
  await shot(page, 'toc-mobile')
  await dialog.getByRole('link', { name: 'DESCRIPTION' }).click()
  await expect(page).toHaveURL(/#description$/)
})

test('command palette: search, actions, and headings', async ({ page }) => {
  await page.goto('/')
  await shellReady(page)
  await page.getByRole('button', { name: 'Search' }).click()
  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await input.fill('tar')
  await page.getByRole('option', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  await page.getByRole('button', { name: 'Search' }).click()
  await input.fill('>section 3')
  await expect(page.getByText('Actions', { exact: true })).toBeVisible()
  await page.getByRole('option', { name: /Go to section 3/i }).click()
  await expect(page).toHaveURL(/\/section\/3/)

  await page.goto('/man/tar/1')
  await shellReady(page)
  await page.getByRole('button', { name: 'Search' }).click()
  await input.fill('#examples')
  await expect(page.getByText('Headings', { exact: true })).toBeVisible()
  await page.getByRole('option', { name: /EXAMPLES/i }).click()
  await expect(page).toHaveURL(/#examples$/)
  await shot(page, 'palette')

  await page.keyboard.press('Control+k')
  await input.fill('zzz-no-match')
  await expect(page.getByText('No matches.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
})

test('keyboard shortcuts dialog and single-key chords', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Toggle bookmark')).toBeVisible()
  await shot(page, 'shortcuts')
  await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click()
  await expect(dialog).toBeHidden()

  await page.keyboard.press('t')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  await page.keyboard.press('h')
  await expect(page).toHaveURL(/\/#recent$/)
})

test('theme: cycle persists in localStorage', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Cycle theme' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bm-theme'))).toBe('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await shot(page, 'theme-light')
  await page.reload()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bm-theme'))).toBe('light')
})

test('reading preferences: font size and reset', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'large')
  await shot(page, 'reading-prefs')
  await dialog.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'medium')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('distro variant: ubuntu marker and an unknown distro query', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  const select = page.getByLabel('Select distribution variant')
  await expect(select.locator('option')).toHaveText(['Debian', 'Ubuntu', 'Fedora'])
  await select.selectOption('ubuntu')
  await expect(page).toHaveURL(/distro=ubuntu/)
  await expect(page.getByText('Ubuntu variant: this page is intentionally different for E2E testing.')).toBeVisible()
  await shot(page, 'distro-ubuntu')

  await page.goto('/search?q=tar&distro=not-a-distro')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
})

test('bookmarks: toggle, home list, remove, hostile storage', async ({ page }) => {
  await page.goto('/man/tar/1')
  await shellReady(page)
  await page.getByRole('button', { name: 'Bookmark tar(1)' }).click()
  await expect(page.getByRole('button', { name: 'Remove bookmark for tar(1)' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Bookmark tar(1)' })).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Remove bookmark for tar(1)' })).toBeVisible()

  await page.goto('/bookmarks')
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.getByRole('region', { name: 'Bookmarks' }).getByRole('link', { name: /tar\(1\)/ })).toBeVisible()
  await shot(page, 'bookmarks')
  await page.getByRole('button', { name: 'Remove bookmark for tar(1)' }).click()
  await expect(page.getByText('No bookmarks yet')).toBeVisible()

  await page.evaluate(() => localStorage.setItem('bm-bookmarks', '{not json'))
  await page.reload()
  await expect(page.getByText('No bookmarks yet')).toBeVisible()
})

test('recent: recorded page and clear from the palette', async ({ page }) => {
  await page.goto('/man/gzip/1')
  await shellReady(page)
  await page.goto('/history')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: /gzip\(1\)/ })).toBeVisible()
  await shot(page, 'recent')

  await page.getByRole('button', { name: 'Search' }).click()
  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await input.fill('>clear recent')
  await page.getByRole('option', { name: /Clear recent history/i }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('No recent pages')).toBeVisible()
})

test('licenses: empty seeded package list', async ({ page }) => {
  await page.goto('/man/tar/1')
  await page.getByRole('contentinfo', { name: 'Site footer' }).getByRole('link', { name: 'Licenses' }).click()
  await expect(page).toHaveURL(/\/licenses/)
  await expect(page.getByRole('heading', { name: 'Licenses' })).toBeVisible()
  const filter = page.getByRole('textbox', { name: 'Filter packages' })
  await filter.fill('zzzz')
  await expect(page.getByText('Select a package to view its license text.')).toBeVisible()
  await shot(page, 'licenses')
})

test('not found route returns home', async ({ page }) => {
  await page.goto('/definitely-not-a-route')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await shot(page, 'not-found')
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
})

test('chrome: skip link, footer dataset line, offline banner', async ({ page, context }) => {
  await page.goto('/')
  await page.locator('a[href="#main-content"]').focus()
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible()
  await expect(page.getByRole('contentinfo', { name: 'Site footer' })).toContainText(/pages/)
  await shot(page, 'chrome')

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText(/Offline/)).toBeVisible()
  await shot(page, 'offline')
  await context.setOffline(false)
})

test('dev server leaves the service worker unregistered', async ({ page }) => {
  await page.goto('/')
  const registrations = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return []
    const all = await navigator.serviceWorker.getRegistrations()
    return all.map((registration) => registration.scope)
  })
  expect(registrations).toEqual([])
})

test('discovery: robots, sitemap, and man page JSON-LD', async ({ page }) => {
  const robots = await page.goto('/robots.txt')
  expect(robots?.status()).toBe(200)
  await expect(page.locator('body')).toContainText('Sitemap:')

  const sitemap = await page.goto('/sitemap.xml')
  expect(sitemap?.status()).toBe(200)
  await expect(page.locator('body')).toContainText('sitemapindex')

  await page.goto('/man/tar/1')
  const jsonLd = page.locator('head script[type="application/ld+json"][nonce]')
  await expect(jsonLd).toHaveCount(1)
  expect((await jsonLd.textContent()) ?? '').toContain('"@type":"TechArticle"')
  await shot(page, 'discovery-tar')
})

test('journey: search, open, bookmark, and remove', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: 'Search man pages' })
  await search.fill('gzip')
  await search.press('Enter')
  await page.getByRole('link', { name: /gzip\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /gzip\(1\)/i })).toBeVisible()
  await shellReady(page)
  await page.getByRole('button', { name: 'Bookmark gzip(1)' }).click()
  await page.goto('/#bookmarks')
  const row = page.getByRole('region', { name: 'Bookmarks' })
  await expect(row.getByRole('link', { name: /gzip\(1\)/ })).toBeVisible()
  await shot(page, 'journey-bookmark')
  await row.getByRole('button', { name: 'Remove bookmark for gzip(1)' }).click()
  await expect(page.getByText('No bookmarks yet')).toBeVisible()
})
