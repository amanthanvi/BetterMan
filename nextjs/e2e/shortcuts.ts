import { expect, type Page } from '@playwright/test'

// Site-wide contract: each client runtime sets this after its interactive handlers attach.
export async function waitForInteractiveShell(page: Page, timeout = 5_000) {
  await expect(page.locator('html')).toHaveAttribute('data-bm-hydrated', 'true', { timeout })
}
