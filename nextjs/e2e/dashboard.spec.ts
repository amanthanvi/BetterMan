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

test('mobile: header search opens the palette and bookmarks live on the home page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Bookmarks' }).first()).toBeVisible()
})
