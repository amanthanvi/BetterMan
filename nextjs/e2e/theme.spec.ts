import { test, expect } from '@playwright/test'

test('theme: cycle persists to localStorage', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Cycle theme' }).click()

  const stored = await page.evaluate(() => localStorage.getItem('bm-theme'))
  expect(stored).toBe('light')

  await page.reload()
  const storedAfter = await page.evaluate(() => localStorage.getItem('bm-theme'))
  expect(storedAfter).toBe('light')

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})
