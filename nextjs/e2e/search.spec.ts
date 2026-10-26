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

test('search: live query updates preserve input focus', async ({ page }) => {
  await page.goto('/search')

  const input = page.getByRole('searchbox', { name: 'Search man pages' })
  await input.fill('tar')
  await input.click()

  await expect(page).toHaveURL(/\/search\?q=tar/)
  await expect(input).toBeFocused()

  await input.pressSequentially(' gzip')
  await expect(page).toHaveURL(/q=tar(?:\+|%20)gzip/)
  await expect(input).toBeFocused()
})

test('search: typo still finds relevant results', async ({ page }) => {
  await page.goto('/search?q=tarr')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByText('Did you mean:', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'tar', exact: true })).toHaveAttribute('href', '/search?q=tar')
})

test('search: citations resolve the exact section without correction copy', async ({ page }) => {
  await page.goto('/search?q=tar%281%29')
  const first = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
  await expect(first.getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  await expect(page.getByText('Did you mean:', { exact: false })).toHaveCount(0)
})

test('search: unsupported questions give guidance without an unrelated answer', async ({ page }) => {
  await page.goto('/search?q=how%20do%20I%20extract%20a%20tarball')
  await expect(page.getByText('No results for', { exact: false })).toBeVisible()
  await expect(page.getByText('natural-language questions are not supported yet', { exact: false })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Search results' })).toHaveCount(0)
  await expect(page.getByText('Did you mean:', { exact: false })).toHaveCount(0)
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

test('search: a flag finds the page that defines it and links to the option row', async ({ page }) => {
  await page.goto('/search?q=--create')
  const result = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').first()
  const link = result.getByRole('link', { name: 'tar(1)', exact: true })
  await expect(link).toHaveAttribute('href', '/man/tar/1#opt-create')
  await expect(result.getByText('options', { exact: true })).toBeVisible()
  await expect(result.getByText('-c, --create')).toBeVisible()

  await link.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()

  await page.goto('/search?q=tar%20-c')
  await expect(page.getByRole('link', { name: 'tar(1)', exact: true })).toHaveAttribute('href', '/man/tar/1#opt-create')
  await page.goto('/search?q=tar%20--bogus')
  await expect(page.getByRole('link', { name: 'tar(1)', exact: true })).toHaveAttribute('href', '/man/tar/1')
})

test('search: description words find a page whose name does not match', async ({ page }) => {
  await page.goto('/search?q=archiving')
  await expect(page.getByRole('link', { name: /tar\(1\)/i })).toBeVisible()

  await page.goto('/search?q=expand files')
  await expect(page.getByRole('link', { name: /gzip\(1\)/i })).toBeVisible()
})
