import { test, expect } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

// The service worker would answer chunk requests from its cache and hide the block below.
test.use({ serviceWorkers: 'block' })

test('overlays: a palette chunk that fails to load closes the palette, and the next open fetches it again', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // Production chunk names are hashes, so pick the palette chunk by its content: code only the palette has.
  // (Its labels live in the catalog, which the shared shell chunk carries.)
  let blocking = true
  let blocked = 0
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
    const response = await route.fetch()
    if (blocking && (await response.text()).includes('bm-palette-option-')) {
      blocked += 1
      await route.abort()
      return
    }
    await route.fulfill({ response })
  })

  await page.goto('/')
  await waitForInteractiveShell(page)
  const blockedBeforeOpen = blocked
  await page.getByRole('button', { name: 'Search' }).click()
  // The shell announces the failed open once the import has rejected, however many
  // times the bundler retried the chunk first.
  await expect(page.getByText('Could not open. Try again.')).toHaveCount(1, { timeout: 10_000 })
  expect(blocked).toBeGreaterThan(blockedBeforeOpen)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await expect(input).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0)

  blocking = false
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(input).toBeVisible()
  await expect(page.getByText('Could not open. Try again.')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
