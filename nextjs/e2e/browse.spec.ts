import { expect, test } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { waitForInteractiveShell } from './shortcuts'

test.describe('section browse without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('section: A–Z is complete and works without JavaScript', async ({ page }) => {
    await page.goto('/section/1')
    const az = page.getByRole('navigation', { name: 'Jump to letter' })
    await expect(az.getByRole('link')).toHaveCount(26)
    // A letter on this page jumps to its group; one that is not starts a page there.
    await expect(az.getByRole('link', { name: 'T', exact: true })).toHaveAttribute('href', '#letter-t')
    await expect(az.getByRole('link', { name: 'Z', exact: true })).toHaveAttribute('href', '/section/1?from=z')
    await az.getByRole('link', { name: 'T', exact: true }).click()
    await expect(page).toHaveURL(/#letter-t$/)
    await expect(page.getByRole('region', { name: 'Names starting with T' }).getByRole('link', { name: /tar\(1\)/ })).toBeVisible()

    await page.goto('/section/1?from=t')
    const listing = page.locator('[data-bm-section-list]')
    await expect(listing.getByRole('link').first()).toContainText('tar')
    await expect(listing.getByText('gzip')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Previous' })).toBeVisible()

    // The one field searches the section.
    const filter = page.getByRole('searchbox', { name: 'Filter section 1' })
    await filter.fill('gzip')
    await filter.press('Enter')
    await expect(page).toHaveURL(/\/search\?section=1&q=gzip$/)
    await expect(page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: 'gzip(1)', exact: true })).toBeVisible()
  })

  test('section: a letter after the last name offers the last page', async ({ page }) => {
    await page.goto('/section/1?from=z')
    await expect(page.getByText('No names in section 1 start at Z or later.')).toBeVisible()
    await page.getByRole('link', { name: 'Last page' }).click()
    await expect(page).toHaveURL(/\/section\/1\?before=z$/)
    const listing = page.locator('[data-bm-section-list]')
    await expect(listing.getByRole('link').last()).toContainText('tnftp')
    await expect(page.getByRole('link', { name: 'Next' })).toHaveCount(0)
  })

  test('package: the page is complete without JavaScript', async ({ page }) => {
    await page.goto('/pkg/tar')
    await expect(page.getByRole('heading', { level: 1, name: 'tar' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Manual pages in this package' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'tar(1)' })).toHaveAttribute('href', /\/man\/tar\/1\?distro=debian$/)
    await expect(page.getByText('1.35+dfsg-3')).toBeVisible()
  })
})

test('section: the filter narrows this page as you type', async ({ page }) => {
  await page.goto('/section/1')
  await waitForInteractiveShell(page)
  const filter = page.getByRole('searchbox', { name: 'Filter section 1' })
  const rows = page.locator('[data-bm-section-list] li:visible')
  const total = await rows.count()
  expect(total).toBeGreaterThan(3)
  await expect(async () => {
    await filter.fill('archiv')
    await expect(rows).toHaveCount(1, { timeout: 500 })
  }).toPass()
  await expect(rows.first()).toContainText('tar')
  await expect(page.getByText(`1 of ${total} on this page`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Names starting with G' })).toBeHidden()
  await filter.fill('')
  await expect(rows).toHaveCount(total)
})

test('section and package: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/section/1')
  await expectNoCriticalOrSeriousViolations(page)
  await page.goto('/pkg/tar')
  await expectNoCriticalOrSeriousViolations(page)
})
