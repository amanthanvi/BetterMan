import { expect, test } from '@playwright/test'

test('option search links directly to the parsed option anchor', async ({ page }) => {
  await page.goto('/search?q=--create')
  const results = page.getByRole('list', { name: 'Search results' })
  const tar = results.getByRole('link', { name: 'tar(1)', exact: true })
  await expect(tar).toHaveAttribute('href', '/man/tar/1#opt-create')
  await expect(tar.locator('..').getByText('options', { exact: true })).toBeVisible()
  await tar.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
})
