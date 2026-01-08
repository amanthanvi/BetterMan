import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('command palette: opens and navigates to a page', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')
  const input = page.getByRole('textbox', { name: 'Command palette input' })
  await expect(input).toBeVisible()
  await input.fill('tar')
  await page.getByRole('button', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('command palette: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('textbox', { name: 'Command palette input' })).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})

