import { test, expect } from '@playwright/test'

test('not found: renders and can go home', async ({ page }) => {
  await page.goto('/definitely-not-a-route')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
})
