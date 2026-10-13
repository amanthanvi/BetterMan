import { expect, test } from '@playwright/test'

test('distribution comparison shows a unified addition and returns to the baseline page', async ({ page }) => {
  await page.goto('/man/tar/1?distro=debian&diff=ubuntu')
  const diff = page.locator('[data-bm-man-diff]')
  await expect(diff).toBeVisible()
  await expect(diff).toContainText('Comparing Debian → Ubuntu')
  await expect(diff.getByRole('region', { name: 'Added', exact: true })).toContainText('Ubuntu variant: this page is intentionally different for E2E testing.')
  await expect(page.locator('[data-bm-sidebar]')).toHaveCount(0)
  await diff.getByRole('link', { name: 'Back to man page' }).click()
  await expect(page).toHaveURL('/man/tar/1?distro=debian')
  await expect(page.locator('[data-bm-man-diff]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('identical distribution variants render one quiet line', async ({ page }) => {
  await page.goto('/man/tar/1?distro=debian&diff=fedora')
  const diff = page.locator('[data-bm-man-diff]')
  await expect(diff).toContainText('Comparing Debian → Fedora')
  await expect(diff).toContainText('These distribution variants are identical.')
  await expect(diff.getByRole('region', { name: 'Added', exact: true })).toHaveCount(0)
})

test('unsupported comparison distro keeps an actionable reading route', async ({ page }) => {
  await page.goto('/man/tar/1?distro=debian&diff=invalid')
  await expect(page.locator('[data-bm-man-diff]')).toContainText('Choose a supported distribution to compare.')
  await expect(page.getByRole('link', { name: 'Back to man page' })).toHaveAttribute('href', '/man/tar/1?distro=debian')
})

test('alias redirect preserves the comparison', async ({ page }) => {
  await page.goto('/man/gunzip/1?distro=debian&diff=ubuntu')
  await expect(page).toHaveURL('/man/gzip/1?diff=ubuntu&distro=debian')
  await expect(page.locator('[data-bm-man-diff]')).toContainText('Comparing Debian → Ubuntu')
})
