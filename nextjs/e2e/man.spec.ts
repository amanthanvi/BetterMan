import { test, expect, type Page } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { pressShortcutUntilVisible, selectOptionUntilURL, waitForInteractiveShell } from './shortcuts'

test('man: sticky sidebar renders TOC; find opens from the title bar (desktop)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole('navigation', { name: 'On this page' })).toBeVisible()

  await waitForInteractiveShell(page)
  const findTrigger = page.getByRole('button', { name: 'Find in page' })
  const findInput = page.locator('[data-bm-findbar]').getByRole('textbox', { name: 'Find in page' })
  await findTrigger.click()
  await expect(findInput).toBeFocused()
  await findTrigger.click()
  await expect(findInput).toBeFocused()
  await page.evaluate(() => {
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
    const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
    const pendingFrames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1_000_000

    window.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      pendingFrames.set(frameId, callback)
      return frameId
    }
    window.cancelAnimationFrame = (frameId) => {
      pendingFrames.delete(frameId)
    }

    ;(
      window as Window & {
        __bmFlushFocusFrames?: () => void
      }
    ).__bmFlushFocusFrames = () => {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
      const callbacks = [...pendingFrames.values()]
      pendingFrames.clear()
      callbacks.forEach((callback) => callback(performance.now()))
    }
  })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-bm-findbar]')).toHaveCount(0)
  await page.evaluate(() => {
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Find in page"]')
    if (!trigger) throw new Error('Find trigger is missing')
    trigger.click()
  })
  await expect(findInput).toBeFocused()
  await page.evaluate(() => {
    const testWindow = window as Window & { __bmFlushFocusFrames?: () => void }
    if (!testWindow.__bmFlushFocusFrames) throw new Error('Focus-frame test harness is missing')
    testWindow.__bmFlushFocusFrames()
    delete testWindow.__bmFlushFocusFrames
  })
  await expect(findInput).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-bm-findbar]')).toHaveCount(0)
  await expect(findTrigger).toBeFocused()
})

test('man: sidebar remains sticky while scrolling (desktop)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar).toBeVisible()

  const header = page.getByRole('banner', { name: 'Site header' })

  const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight))
  const y1 = Math.min(400, maxY)
  const y2 = Math.min(y1 + 150, maxY)

  await page.evaluate((y) => window.scrollTo(0, y), y1)
  await page.waitForFunction((y) => window.scrollY >= y - 2, y1)

  const headerBottom = await header.evaluate((el) => el.getBoundingClientRect().bottom)
  const top1 = await sidebar.evaluate((el) => el.getBoundingClientRect().top)
  expect(top1).toBeGreaterThan(headerBottom - 1)

  await page.evaluate((y) => window.scrollTo(0, y), y2)
  await page.waitForFunction((y) => window.scrollY >= y - 2, y2)

  const top2 = await sidebar.evaluate((el) => el.getBoundingClientRect().top)
  expect(Math.abs(top2 - top1)).toBeLessThan(2)
})

test('man: sidebar collapses and expands with b', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)

  const sidebar = page.locator('[data-bm-sidebar]')
  const tocNav = sidebar.getByRole('navigation', { name: 'On this page' })
  const expandButton = sidebar.getByRole('button', { name: 'Expand sidebar' })
  await expect(tocNav).toBeVisible()

  await pressShortcutUntilVisible(page, 'b', expandButton)

  await pressShortcutUntilVisible(page, 'b', tocNav)
})

test('man: reading preferences drawer applies settings', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await waitForInteractiveShell(page)
  // Without saved preferences there is no cookie to freeze today's defaults.
  expect((await page.context().cookies()).map((cookie) => cookie.name)).not.toContain('bm-reading-prefs')

  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close reading preferences' })).toBeFocused()

  await dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'large')

  // The server HTML must carry the choice, so a post-hydration effect cannot
  // mask a missing first-paint attribute.
  const response = await page.reload()
  expect(response?.status()).toBe(200)
  expect(await response!.text()).toContain('data-bm-font-size="large"')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  await expect(dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true })).toBeChecked()

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: switching distro from reading preferences keeps the URL hash', async ({ page }) => {
  await page.goto('/man/tar/1#synopsis')
  await waitForInteractiveShell(page)

  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await dialog.getByRole('radiogroup', { name: 'Default distro' }).getByRole('radio', { name: '@ubuntu' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1\?distro=ubuntu#synopsis$/)
})

test('man: switching distro twice keeps a single URL hash', async ({ page }) => {
  await page.goto('/man/tar/1#synopsis')
  await waitForInteractiveShell(page)

  const variantSelect = page.getByLabel('Select distribution variant')
  await selectOptionUntilURL(page, variantSelect, 'ubuntu', /\/man\/tar\/1\?distro=ubuntu#synopsis$/)
  await selectOptionUntilURL(page, variantSelect, 'debian', /\/man\/tar\/1#synopsis$/)

  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await dialog.getByRole('radiogroup', { name: 'Default distro' }).getByRole('radio', { name: '@ubuntu' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1\?distro=ubuntu#synopsis$/)
})

test('man: header and footer links work from man pages', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const header = page.getByRole('banner', { name: 'Site header' })

  await waitForInteractiveShell(page)
  await header.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')

  const footer = page.getByRole('contentinfo', { name: 'Site footer' })
  await footer.getByRole('link', { name: 'Licenses' }).click()
  await expect(page).toHaveURL(/\/licenses/)
})

test('man: mobile TOC drawer opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const openContents = page.getByRole('button', { name: 'Open contents' })
  await expect(openContents).toBeVisible({ timeout: 10_000 })
  await openContents.click()

  await expect(page.getByRole('dialog', { name: 'Table of contents' })).toBeVisible()
  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: find-in-page shows count and navigates matches', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Find in page' }).click()
  const findbar = page.locator('[data-bm-findbar]')
  await expect(findbar).toBeVisible()

  await findbar.getByRole('textbox', { name: 'Find in page' }).fill('tar')
  await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()

  const count = findbar.getByText(/^\d+\/\d+$/)
  const label = (await count.innerText()).trim()
  expect(label).toMatch(/^1\/\d+$/)
  const totalRaw = label.split('/')[1]
  const total = totalRaw ? Number.parseInt(totalRaw, 10) : Number.NaN
  expect(total).toBeGreaterThan(1)

  await findbar.getByRole('button', { name: 'Next match' }).click()
  await expect(count).toHaveText(new RegExp(`^2/${total}$`))

  await findbar.getByRole('button', { name: 'Previous match' }).click()
  await expect(count).toHaveText(new RegExp(`^1/${total}$`))

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: long pages render every block, so find reaches the last match', async ({ page }) => {
  await page.goto('/man/bash/1')
  await expect(page.getByText('Filler block 120 for bash(1) long-page tests.')).toBeAttached()

  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Find in page' }).click()
  const findbar = page.locator('[data-bm-findbar]')
  await findbar.getByRole('textbox', { name: 'Find in page' }).fill('filler block')
  const count = findbar.getByText(/^\d+\/\d+$/)
  await expect(count).toHaveText('1/120')

  await findbar.getByRole('button', { name: 'Previous match' }).click()
  await expect(count).toHaveText('120/120')
  await expect(page.locator('mark.bm-find-active')).toBeInViewport()

  // Blocks far from the viewport skip rendering on screen; print renders them all.
  const lastBlock = page.getByText('Filler block 120 for bash(1) long-page tests.')
  const blockVisibility = () => lastBlock.evaluate((el) => getComputedStyle(el.closest('p')!.parentElement!).contentVisibility)
  expect(await blockVisibility()).toBe('auto')
  await page.emulateMedia({ media: 'print' })
  expect(await blockVisibility()).toBe('visible')
  await expect(lastBlock).toBeVisible()
})

test('man: a deep link into a long page lands at the sticky-header offset', async ({ page }) => {
  await page.goto('/man/bash/1#notes')
  const heading = page.locator('h2#notes')
  await expect(heading).toBeInViewport()
  // scroll-mt-32: the heading sits 8rem under the viewport top, below the sticky header.
  await expect.poll(async () => Math.round((await heading.boundingBox())?.y ?? Number.NaN)).toBe(128)
})

test('man: options table splits flags and highlights terms', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')

  const table = page.getByRole('table', { name: 'Command-line options' })
  await expect(table).toBeVisible()

  await expect(table.getByText('-c', { exact: true })).toBeVisible()
  await expect(table.getByText('--create', { exact: true })).toBeVisible()
  await expect(table.getByText('-c, --create', { exact: true })).toHaveCount(0)

  await table.getByText('-c', { exact: true }).click()
  await expect(page.locator('mark[data-bm-opt]').first()).toBeVisible()
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: TOC navigation updates the URL hash and scrolls', async ({ page }) => {
  await page.goto('/man/tar/1')

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar).toBeVisible()

  const toc = sidebar.locator('nav[aria-label="On this page"]')
  const examples = toc.getByRole('link', { name: 'EXAMPLES' })

  const yBefore = await page.evaluate(() => window.scrollY)
  await examples.click()

  await expect(page).toHaveURL(/\/man\/tar\/1#examples$/)
  await page.waitForFunction((y) => window.scrollY > y + 30, yBefore)
  await expect(examples).toHaveAttribute('aria-current', 'location')
})

// Chromium's scroll anchoring hides most late shifts, so turn it off and grow the
// article the way lazy highlighting does after the hash scroll has already run.
async function shiftContentAbove(page: Page, px: number) {
  await page.addStyleTag({ content: 'html { overflow-anchor: none }' })
  await page.evaluate((height) => {
    const spacer = document.createElement('div')
    spacer.style.height = `${height}px`
    document.querySelector('article')?.prepend(spacer)
  }, px)
}

function topOf(page: Page, id: string) {
  return page.locator(`#${id}`).evaluate((el) => Math.round(el.getBoundingClientRect().top))
}

async function gotoPinnedDeepLink(page: Page) {
  await page.goto('/man/bash/1#bugs')
  await expect(page.locator('#notes-code-5')).toBeAttached()
  await page.waitForFunction(() => Object.keys(document.getElementById('bugs')!).some((key) => key.startsWith('__reactFiber')))
  // The pin starts on the frame after hydration effects run.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect.poll(() => topOf(page, 'bugs')).toBe(128)
}

test('man: a hash deep link stays at the header offset after late layout shifts', async ({ page }) => {
  await gotoPinnedDeepLink(page)

  await shiftContentAbove(page, 300)
  await expect.poll(() => topOf(page, 'bugs')).toBe(128)

  // Once the reader scrolls, later shifts leave the page where they put it.
  await page.mouse.wheel(0, 40)
  await expect.poll(() => topOf(page, 'bugs')).toBeLessThan(100)
  await shiftContentAbove(page, 300)
  await expect.poll(() => topOf(page, 'bugs')).toBeGreaterThan(350)
  await page.waitForTimeout(300)
  expect(await topOf(page, 'bugs')).toBeGreaterThan(350)
})

test('man: a hash deep link stops re-pinning after a few seconds', async ({ page }) => {
  await gotoPinnedDeepLink(page)

  await page.evaluate(() => {
    const now = performance.now.bind(performance)
    performance.now = () => now() + 60_000
  })
  await shiftContentAbove(page, 300)
  // Highlighting can still nudge the heading by a few pixels; a re-pin would put it back at 128.
  await expect.poll(() => topOf(page, 'bugs')).toBeGreaterThan(400)
  await page.waitForTimeout(300)
  expect(await topOf(page, 'bugs')).toBeGreaterThan(400)
})

test('man: TOC navigation stays at the header offset after late layout shifts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/man/bash/1')
  await waitForInteractiveShell(page)

  await page.locator('[data-bm-sidebar]').getByRole('link', { name: 'BUGS' }).click()
  await expect(page).toHaveURL(/\/man\/bash\/1#bugs$/)
  await expect.poll(() => topOf(page, 'bugs')).toBe(128)

  await shiftContentAbove(page, 300)
  await expect.poll(() => topOf(page, 'bugs')).toBe(128)
})

test('man: extended section URLs work', async ({ page }) => {
  await page.goto('/man/openssl/1ssl')
  await expect(page.getByRole('heading', { name: /openssl\(1ssl\)/i })).toBeVisible()
})

test('man: distro variant selector swaps content', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await waitForInteractiveShell(page)

  const marker = page.getByText('Ubuntu variant: this page is intentionally different for E2E testing.')
  await expect(marker).toHaveCount(0)

  const variantSelect = page.getByLabel('Select distribution variant')
  await expect(variantSelect).toBeVisible()

  await selectOptionUntilURL(page, variantSelect, 'ubuntu', /distro=ubuntu/)
  await expect(marker).toBeVisible()
})

test('man: header names the distro served after a fallback', async ({ page }) => {
  // Arch has no seeded release, so the page is served from Debian.
  await page.goto('/man/gzip/1?distro=arch')
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: /gzip\(1\)/i }) })
  await expect(header.getByText('Debian', { exact: true })).toBeVisible()
  await expect(header.getByText('Arch Linux', { exact: true })).toHaveCount(0)
})

test('man: distro variant selector keeps full supported ordering', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const variantSelect = page.getByLabel('Select distribution variant')
  await expect(variantSelect).toBeVisible()

  await expect(variantSelect.locator('option')).toHaveText([
    'Debian',
    'Ubuntu',
    'Fedora',
    'FreeBSD',
    'macOS (BSD-licensed subset)',
  ])
})

test('man: distro variant selector paints the page colours its native popup copies', async ({ page }) => {
  // Chromium renders the dropdown as a separate page with a white body and copies the
  // <select>'s computed background-color and color onto the option list, so the select
  // has to carry an opaque page background in every theme or dark ink lands on white.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)

  const variantSelect = page.getByLabel('Select distribution variant')
  await expect(variantSelect).toBeVisible()
  // The client sets data-theme after hydration; before that the cycle button is inert.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const paint = () =>
    variantSelect.evaluate((select) => {
      const own = getComputedStyle(select)
      const root = getComputedStyle(document.documentElement)
      const option = getComputedStyle(select.querySelector('option')!)
      return {
        scheme: own.colorScheme,
        background: own.backgroundColor,
        color: own.color,
        optionColor: option.color,
        pageBackground: root.backgroundColor,
        pageColor: root.color,
      }
    })

  const dark = await paint()
  expect(dark.scheme).toBe('dark')
  expect(dark.background).toBe(dark.pageBackground)
  expect(dark.background).not.toMatch(/, 0\)$/)
  expect(dark.color).toBe(dark.pageColor)
  expect(dark.optionColor).toBe(dark.pageColor)

  // System mode follows the dark OS here; one cycle switches to the explicit light theme.
  await page.getByRole('button', { name: 'Cycle theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const light = await paint()
  expect(light.scheme).toBe('light')
  expect(light.background).toBe(light.pageBackground)
  expect(light.background).not.toBe(dark.background)
  expect(light.color).toBe(light.pageColor)
  expect(light.optionColor).toBe(light.pageColor)
})

test('man: ambiguous by-name route renders picker', async ({ page }) => {
  await page.goto('/man/printf')
  await expect(page.getByRole('heading', { name: 'printf' })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(1\)/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(3\)/i })).toBeVisible()
})

test('man: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expectNoCriticalOrSeriousViolations(page)
})

test('man: a11y with reading preferences open (no critical/serious violations)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Reading preferences' }).click()
  await expect(page.getByRole('dialog', { name: 'Reading preferences' })).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})

test('man: .so alias redirects to its target page', async ({ page }) => {
  const res = await page.goto('/man/gunzip/1')
  expect(res?.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/man\/gzip\/1$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('gzip')

  const api = await page.request.get('/api/v1/man/gunzip/1', { maxRedirects: 0 })
  expect(api.status()).toBe(308)
  expect(api.headers()['location']).toBe('/api/v1/man/gzip/1')
})

test('man: NAME is not repeated in the body and RELATED hides when empty', async ({ page }) => {
  await page.goto('/man/printf/3')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('printf')
  await expect(page.getByRole('heading', { name: /^NAME$/ })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Related commands' })).toHaveCount(0)
  await expect(page.getByText('Loading related commands')).toHaveCount(0)

  await page.goto('/man/tar/1')
  await expect(page.getByRole('complementary', { name: 'Related commands' })).toBeVisible()
})

test('man: content is complete without JavaScript, and controls that need it are hidden', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { level: 1, name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Command-line options' }).getByText('-c', { exact: true })).toBeVisible()
  await expect(page.locator('dt#opt-create')).toBeVisible()
  await expect(page.locator('article p').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Find in page' })).toHaveCount(0)
  await expect(page.getByRole('banner', { name: 'Site header' }).getByRole('link', { name: 'Search', exact: true })).toHaveAttribute('href', '/search')
  await context.close()
})

test('man: scrollable code is keyboard-focusable and named, and the contents list holds only items', async ({ page }) => {
  await page.goto('/man/tar/1')
  const code = page.locator('#example-1 pre')
  await expect(code).toHaveAttribute('tabindex', '0')
  await expect(code).toHaveAttribute('aria-label', 'Code')
  const strayChildren = await page
    .locator('[data-bm-sidebar] nav[aria-label="On this page"] ol')
    .evaluate((list) => [...list.children].filter((child) => child.tagName !== 'LI').length)
  expect(strayChildren).toBe(0)
})

test('man: phones under 400px drop the running head; wider screens keep it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/man/tar/1')
  const head = page.locator('main .bm-rh').first()
  await expect(head).toBeHidden()
  await page.setViewportSize({ width: 768, height: 900 })
  await expect(head).toBeVisible()
})

test('Perl module URLs render encoded names, name-only redirects, and search citations', async ({ page, request }) => {
  for (const path of ['/man/foo%3A%3Abar/3pm', '/man/foo::bar/3pm', '/man/foo%3A%3Abar']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
    await expect(page.getByRole('heading', { name: 'foo::bar(3pm)', exact: true })).toBeVisible()
    await expect(page.getByText('Perl module documentation.', { exact: true })).toBeVisible()
  }
  const api = await request.get('/api/v1/man/foo%3A%3Abar/3pm')
  expect(api.status()).toBe(200)
  const search = await request.get('/api/v1/search?q=Foo%3A%3ABar(3pm)')
  expect(search.status()).toBe(200)
  expect((await search.json()).results).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'foo::bar', section: '3pm' })]))
})
