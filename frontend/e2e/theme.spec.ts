import { test, expect } from '@playwright/test'

test('theme: cycle persists to localStorage', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Theme' }).click()

  const stored = await page.evaluate(() => localStorage.getItem('bm-theme'))
  expect(stored).toBe('light')

  await page.reload()
  const storedAfter = await page.evaluate(() => localStorage.getItem('bm-theme'))
  expect(storedAfter).toBe('light')
})

