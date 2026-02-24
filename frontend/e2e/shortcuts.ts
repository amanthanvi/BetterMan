import { expect, type Locator, type Page } from '@playwright/test'

export async function waitForInteractiveShell(page: Page) {
  await expect(page.getByRole('button', { name: 'Select UI theme' })).toBeVisible()
}

export async function pressShortcutUntilVisible(page: Page, shortcut: string, target: Locator, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.keyboard.press(shortcut)
    try {
      await expect(target).toBeVisible({ timeout: 500 })
      return
    } catch {
      // Retry to absorb listener-attach races in CI.
    }
  }
  await expect(target).toBeVisible()
}
