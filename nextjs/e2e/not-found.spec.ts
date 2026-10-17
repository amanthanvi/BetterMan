import { test, expect } from '@playwright/test'

test('not found: renders and can go home', async ({ page }) => {
  await page.goto('/definitely-not-a-route')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
})

test('not found: a missing man page is a 404 that suggests nearby names', async ({ page }) => {
  const res = await page.goto('/man/ta/9')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByText('ta(9)', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'tar(1)' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
})
