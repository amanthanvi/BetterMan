import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('search: Try links trigger a search', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()

  await page.getByRole('link', { name: 'tar', exact: true }).click()
  await expect(page).toHaveURL(/\/search\?q=tar/)
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
})

test('search: query returns results and can open a man page', async ({ page }) => {
  await page.goto('/search?q=tar')
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
  await page.getByRole('link', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('search: typo still finds relevant results', async ({ page }) => {
  await page.goto('/search?q=tarr')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
})

test('search: load more disables when all results are loaded', async ({ page }) => {
  await page.goto('/search?q=tar')

  const loadMore = page.getByRole('button', { name: 'Load more results' })
  await expect(loadMore).toBeVisible()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await loadMore.isDisabled()) break
    await loadMore.click()
  }

  await expect(loadMore).toBeDisabled()
})

test('search: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/search?q=tar')
  await expectNoCriticalOrSeriousViolations(page)
})
