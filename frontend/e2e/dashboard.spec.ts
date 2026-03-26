import { test, expect } from '@playwright/test'

test('dashboard shortcuts and redirects preserve section intent', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('h')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.locator('#recent')).toBeVisible()

  await page.goto('/history')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.locator('#recent')).toBeVisible()

  await page.goto('/bookmarks')
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.locator('#bookmarks')).toBeVisible()
})

test('mobile bottom nav bookmark tab lands on dashboard bookmarks section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('link', { name: 'Bookmarks' }).click()
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.locator('#bookmarks')).toBeVisible()
})
