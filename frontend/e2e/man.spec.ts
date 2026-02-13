import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('man: sticky sidebar renders TOC + Find (desktop)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByText('Quick jumps')).toBeVisible()
  await expect(sidebar.getByRole('textbox', { name: 'Find in page' })).toBeVisible()
  await expect(sidebar.getByRole('navigation', { name: 'On this page' })).toBeVisible()
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

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar.getByRole('textbox', { name: 'Find in page' })).toBeVisible()

  await page.keyboard.press('b')
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

  await page.keyboard.press('b')
  await expect(sidebar.getByRole('textbox', { name: 'Find in page' })).toBeVisible()
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

  await page.keyboard.press('p')
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-bm-font-size', 'large')

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: header and footer links work from man pages', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const header = page.getByRole('banner', { name: 'Site header' })

  await header.getByRole('link', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/search/)

  await page.goto('/man/tar/1')

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

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar).toBeVisible()

  await sidebar.getByRole('textbox', { name: 'Find in page' }).fill('tar')
  await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()

  const count = sidebar.getByText(/^\d+\/\d+$/)
  const label = (await count.innerText()).trim()
  expect(label).toMatch(/^1\/\d+$/)
  const totalRaw = label.split('/')[1]
  const total = totalRaw ? Number.parseInt(totalRaw, 10) : Number.NaN
  expect(total).toBeGreaterThan(1)

  await sidebar.getByRole('button', { name: 'Next match' }).click()
  await expect(count).toHaveText(new RegExp(`^2/${total}$`))

  await sidebar.getByRole('button', { name: 'Previous match' }).click()
  await expect(count).toHaveText(new RegExp(`^1/${total}$`))

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
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
  await expect(examples).toHaveAttribute('class', /border-\[var\(--bm-accent\)\]/)
})

test('man: extended section URLs work', async ({ page }) => {
  await page.goto('/man/openssl/1ssl')
  await expect(page.getByRole('heading', { name: /openssl\(1ssl\)/i })).toBeVisible()
})

test('man: distro variant selector swaps content', async ({ page }) => {
  await page.goto('/man/tar/1?distro=debian')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const marker = page.getByText('Ubuntu variant: this page is intentionally different for E2E testing.')
  await expect(marker).toHaveCount(0)

  const variantSelect = page.getByLabel('Select distribution variant')
  await expect(variantSelect).toBeVisible()

  await Promise.all([
    page.waitForURL(/distro=ubuntu/, { timeout: 15_000 }),
    variantSelect.selectOption('ubuntu'),
  ])

  await expect(marker).toBeVisible()
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
