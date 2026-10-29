import { expect, type Page } from '@playwright/test'

// Site-wide contract: each client runtime sets this once per document load,
// after its shell keyboard and click handlers attach. Page content under a
// loading boundary can hydrate later; wait on that content before using it.
export async function waitForInteractiveShell(page: Page, timeout = 5_000) {
  await expect(page.locator('html')).toHaveAttribute('data-bm-hydrated', 'true', { timeout })
}

/** Home lists recents and bookmarks only once they exist; give it one of each before load. */
export async function seedRecentAndBookmark(page: Page) {
  await page.addInitScript(() => {
    const at = Date.now() - 60_000
    if (!window.localStorage.getItem('bm-recent')) {
      window.localStorage.setItem('bm-recent', JSON.stringify({ version: 1, items: [{ kind: 'page', name: 'tar', section: '1', description: 'an archiving utility', at }] }))
    }
    if (!window.localStorage.getItem('bm-bookmarks')) {
      window.localStorage.setItem('bm-bookmarks', JSON.stringify({ version: 1, items: [{ name: 'gzip', section: '1', description: 'compress or expand files', addedAt: at }] }))
    }
  })
}
