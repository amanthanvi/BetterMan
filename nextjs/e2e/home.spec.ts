import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { waitForInteractiveShell } from './shortcuts'

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

test('home: typing shows results inline, with the top hit, and keeps the box', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  const box = page.getByRole('searchbox', { name: 'Search man pages' })
  // The box sits under home's loading boundary and can hydrate after the shell.
  await expect(async () => {
    await box.fill('')
    await box.pressSequentially('tar')
    await expect(page).toHaveURL(/\/\?q=tar$/, { timeout: 1_500 })
  }).toPass()
  await expect(box).toBeFocused()
  const results = page.getByRole('list', { name: 'Search results' })
  await expect(results.getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  await expect(page.locator('[data-bm-top-hit]')).toContainText('Explain this line')
  await expect(page.getByRole('heading', { name: 'Browse' })).toHaveCount(0)
  // Clearing the box returns to the plain home.
  await box.fill('')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible()
})

test('home: the placeholder is living, and static under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await waitForInteractiveShell(page)
  const box = page.getByRole('searchbox', { name: 'Search man pages' })
  const first = await box.getAttribute('placeholder')
  await page.waitForTimeout(3600)
  expect(await box.getAttribute('placeholder')).toBe(first)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await waitForInteractiveShell(page)
  await expect.poll(() => box.getAttribute('placeholder'), { timeout: 8000 }).not.toBe(first)
})

test.describe('home without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('home: the box submits to the search page', async ({ page }) => {
    await page.goto('/')
    const box = page.getByRole('searchbox', { name: 'Search man pages' })
    await box.fill('tar')
    await box.press('Enter')
    await expect(page).toHaveURL(/\/search\?q=tar$/)
    await expect(page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: 'tar(1)', exact: true })).toBeVisible()
  })
})
