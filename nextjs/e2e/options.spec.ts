import { expect, test } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('man: the options index filters by text and portability, and never hides the manual', async ({ page }) => {
  await page.goto('/man/ls/1')
  await waitForInteractiveShell(page)
  const index = page.getByRole('region', { name: 'Options' })
  const table = index.getByRole('table', { name: 'Command-line options' })
  const count = index.locator('[data-bm-options-count]')
  await expect(table.locator('tbody tr:visible')).toHaveCount(10)
  await expect(count).toHaveText('10 options')

  // The GNU-only flags carry the three-cell glyph, named in words.
  const color = table.locator('tr').filter({ hasText: '--color' })
  await expect(color.getByRole('img')).toHaveAttribute('aria-label', /GNU\/Linux \(debian\): option available; FreeBSD \(freebsd\): .+; macOS \(macos\): .+/)
  await expect(index.getByText(/A hollow cell means that system lacks the flag/)).toBeVisible()

  await index.getByRole('checkbox', { name: 'Portable only' }).check()
  await expect(table.locator('tbody tr:visible')).toHaveCount(8)
  await expect(color).toBeHidden()
  await expect(count).toHaveText('8 of 10')

  await index.getByRole('searchbox', { name: 'Filter options' }).fill('sort')
  await expect(table.locator('tbody tr:visible')).toHaveCount(3)
  await expect(count).toHaveText('3 of 10')

  // Filters act on the index only: every definition in the manual stays.
  await expect(page.locator('article .bm-manual dt')).toHaveCount(10)
  await expect(page.locator('dt#opt-color')).toBeVisible()

  await index.getByRole('checkbox', { name: 'Portable only' }).uncheck()
  await index.getByRole('searchbox', { name: 'Filter options' }).fill('')
  await expect(count).toHaveText('10 options')
})

test('man: ?portability=text writes the cells as words, and links back to the glyph', async ({ page }) => {
  await page.goto('/man/ls/1')
  await page.getByRole('link', { name: 'Show portability as words' }).click()
  await expect(page).toHaveURL(/\/man\/ls\/1\?portability=text#options-index$/)
  const table = page.getByRole('table', { name: 'Command-line options' })
  await expect(table.getByRole('img')).toHaveCount(0)
  await expect(table.locator('tr').filter({ hasText: '--color' })).toContainText('unknown on FreeBSD and macOS')
  await page.getByRole('link', { name: 'Show portability as cells' }).click()
  await expect(page).toHaveURL(/\/man\/ls\/1#options-index$/)
  await expect(table.getByRole('img')).toHaveCount(2)
})
