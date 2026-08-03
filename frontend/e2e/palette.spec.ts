import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'
import { pressShortcutUntilVisible, waitForInteractiveShell } from './shortcuts'

test('command palette: opens with keyboard shortcut', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await pressShortcutUntilVisible(page, 'ControlOrMeta+K', input)
})

test('command palette: opens and navigates to a page', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await expect(input).toBeVisible()
  await input.fill('tar')
  await page.getByRole('option', { name: /tar\(1\)/i }).click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('command palette: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('combobox', { name: 'Command palette input' })).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})

test('keyboard shortcuts dialog: a11y after immediate reopen', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)

  await page.keyboard.type('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  const closeButton = page.getByRole('button', { name: 'Close keyboard shortcuts' })
  const dialogPanel = page
    .locator('[data-state]')
    .filter({ has: page.locator('button[aria-label="Close keyboard shortcuts"]') })
  await expect(closeButton).toBeVisible()
  await page.evaluate(() => {
    const originalSetTimeout = window.setTimeout.bind(window)
    const originalClearTimeout = window.clearTimeout.bind(window)
    const heldExitTimers = new Map<number, () => void>()
    let nextTimerId = 1_000_000

    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 200 && typeof handler === 'function') {
        const timerId = nextTimerId
        nextTimerId += 1
        heldExitTimers.set(timerId, () => handler())
        return timerId
      }
      return originalSetTimeout(handler, timeout, ...args)
    }) as typeof window.setTimeout
    window.clearTimeout = ((timerId?: number) => {
      if (timerId !== undefined && heldExitTimers.delete(timerId)) return
      originalClearTimeout(timerId)
    }) as typeof window.clearTimeout

    ;(window as Window & { __bmFlushExitTimers?: () => void }).__bmFlushExitTimers = () => {
      window.setTimeout = originalSetTimeout
      window.clearTimeout = originalClearTimeout
      const callbacks = [...heldExitTimers.values()]
      heldExitTimers.clear()
      callbacks.forEach((callback) => callback())
    }
  })
  await closeButton.click()
  await expect(dialogPanel).toHaveAttribute('data-state', 'closed')
  await expect(dialogPanel).toBeAttached()
  await expect(dialog).toHaveCount(0)
  await page.keyboard.type('?')
  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeVisible()
  await page.evaluate(() => {
    const testWindow = window as Window & { __bmFlushExitTimers?: () => void }
    if (!testWindow.__bmFlushExitTimers) throw new Error('Exit-timer test harness is missing')
    testWindow.__bmFlushExitTimers()
    delete testWindow.__bmFlushExitTimers
  })
  await expect(dialog).toBeVisible()
  await expectNoCriticalOrSeriousViolations(page)
})
