import { test, expect } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

// The service worker would answer chunk requests from its cache and hide the block below.
test.use({ serviceWorkers: 'block' })

test('overlays: a palette chunk that fails to load closes the palette, and the next open fetches it again', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // Production chunk names are hashes, so pick the palette chunk by its content.
  let blocking = true
  let blocked = 0
  let lastBlockedAt = 0
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
    const response = await route.fetch()
    if (blocking && (await response.text()).includes('Command palette input')) {
      blocked += 1
      lastBlockedAt = Date.now()
      await route.abort()
      return
    }
    await route.fulfill({ response })
  })

  await page.goto('/')
  await waitForInteractiveShell(page)
  const blockedBeforeOpen = blocked
  await page.getByRole('button', { name: 'Search' }).click()
  // Turbopack retries a failed chunk once, 200-600 ms later, before it rejects the
  // import. The open has failed once an attempt since the click has been followed
  // by a quiet period longer than that.
  await expect
    .poll(() => blocked > blockedBeforeOpen && Date.now() - lastBlockedAt > 700, { timeout: 10_000 })
    .toBe(true)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await expect(input).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)

  blocking = false
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(input).toBeVisible()
  expect(pageErrors).toEqual([])
})
