import { expect, test } from '@playwright/test'
import { waitForInteractiveShell } from './shortcuts'

test('interactive shell requires the client runtime', async ({ page }) => {
  let blocked = 0
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    blocked += 1
    await route.abort()
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Cycle theme' })).toBeVisible()
  expect(blocked).toBeGreaterThan(0)
  await expect(waitForInteractiveShell(page, 1_000)).rejects.toThrow()
})

test('interactive shell becomes ready with JavaScript', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})
