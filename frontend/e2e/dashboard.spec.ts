import { test, expect } from '@playwright/test'

import { waitForInteractiveShell } from './shortcuts'

test('dashboard shortcuts and redirects preserve section intent', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  await page.keyboard.press('h')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()

  await page.goto('/history')
  await expect(page).toHaveURL(/\/#recent$/)
  await expect(page.getByRole('region', { name: 'Recent' }).first()).toBeVisible()

  await page.goto('/bookmarks')
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.getByRole('region', { name: 'Bookmarks' }).first()).toBeVisible()
})

test('mobile bottom nav bookmark tab lands on dashboard bookmarks section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('link', { name: 'Bookmarks' }).click()
  await expect(page).toHaveURL(/\/#bookmarks$/)
  await expect(page.getByRole('region', { name: 'Bookmarks' }).first()).toBeVisible()
})
