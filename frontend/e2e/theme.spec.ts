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

test('ui theme: keyboard menu selection persists via cookie', async ({ page, context }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')

  const uiThemeButton = page.getByRole('button', { name: 'Select UI theme' })
  await uiThemeButton.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.locator('html')).toHaveAttribute('data-bm-ui-theme', 'glass')

  const cookie = (await context.cookies()).find((entry) => entry.name === 'bm-ui-theme')
  expect(cookie?.value).toBe('glass')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-bm-ui-theme', 'glass')

  await expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})
