import { expect, type Page } from '@playwright/test'

// Site-wide contract: each client runtime sets this once per document load,
// after its shell keyboard and click handlers attach. Page content under a
// loading boundary can hydrate later; wait on that content before using it.
export async function waitForInteractiveShell(page: Page, timeout = 5_000) {
  await expect(page.locator('html')).toHaveAttribute('data-bm-hydrated', 'true', { timeout })
}
