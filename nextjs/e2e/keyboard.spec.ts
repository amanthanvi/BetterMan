import { test, expect, type Page } from '@playwright/test'

import { pressShortcutUntilVisible, waitForInteractiveShell } from './shortcuts'

function storedTheme(page: Page) {
  return page.evaluate(() => localStorage.getItem('bm-theme'))
}

// Theme cycles system → light → dark, so a single `d` after closing the overlay
// lands on `light` only if every `d` pressed inside the overlay was ignored.
async function expectThemeShortcutStillWorks(page: Page) {
  await expect.poll(() => storedTheme(page)).toBeNull()
  await page.keyboard.press('d')
  await expect.poll(() => storedTheme(page)).toBe('light')
}

test('shortcuts: single-key shortcuts are ignored while the shortcuts dialog has focus', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  const closeButton = page.getByRole('button', { name: 'Close keyboard shortcuts' })
  await pressShortcutUntilVisible(page, '?', dialog)
  await expect(closeButton).toBeFocused()

  for (const key of ['d', 'h', 't', '/']) await page.keyboard.press(key)

  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeFocused()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expectThemeShortcutStillWorks(page)
  await expect(page).not.toHaveURL(/#recent$/)
})

test('shortcuts: single-key shortcuts are ignored while the command palette is open without input focus', async ({
  page,
}) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(input).toBeVisible()
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await expect(input).not.toBeFocused()

  for (const key of ['d', 'h', '?', '/']) await page.keyboard.press(key)

  await expect(input).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expectThemeShortcutStillWorks(page)
  await expect(page).not.toHaveURL(/#recent$/)
})

test('man: single-key shortcuts are ignored inside the reading preferences drawer', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await waitForInteractiveShell(page)

  const sidebar = page.locator('[data-bm-sidebar]')
  await expect(sidebar.getByRole('navigation', { name: 'On this page' })).toBeVisible()

  await page.getByRole('button', { name: 'Reading preferences' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reading preferences' })
  await expect(dialog).toBeVisible()
  const largeFont = dialog.getByRole('radiogroup', { name: 'Font size' }).getByRole('radio', { name: 'L', exact: true })
  await largeFont.click()
  await expect(largeFont).toBeFocused()

  for (const key of ['b', 'd', 'm', 'h', '?']) await page.keyboard.press(key)

  await expect(largeFont).toBeFocused()
  await expect(dialog).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remove bookmark for / })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expectThemeShortcutStillWorks(page)
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
})
