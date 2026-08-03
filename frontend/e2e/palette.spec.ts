import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { pressShortcutUntilVisible, waitForInteractiveShell } from './shortcuts'

test('command palette: opens with keyboard shortcut', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await pressShortcutUntilVisible(page, 'ControlOrMeta+K', input)
})

test('command palette: opens and navigates to a page', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await expect(input).toBeVisible()
  await input.fill('tar')
  await page.getByRole('option', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('command palette: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})

test('keyboard shortcuts dialog: a11y after immediate reopen', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  await page.keyboard.type('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  const closeButton = page.getByRole('button', { name: 'Close keyboard shortcuts' })
  await expect(closeButton).toBeVisible()
  await closeButton.click()
  await page.keyboard.type('?')
  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})
