import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('home: loads and is searchable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible()
})

test('home: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/')
  await expectNoCriticalOrSeriousViolations(page)
})

test('home: browse link navigates to a section', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /^1\s/i }).click()
  await expect(page).toHaveURL(/\/section\/1(\?|$)/)
  await expect(page).toHaveTitle(/Section\s+1/i)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
