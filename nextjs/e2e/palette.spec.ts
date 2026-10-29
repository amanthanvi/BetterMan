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

test('command palette: focuses the input on every open and returns focus on close', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  const searchButton = page.getByRole('button', { name: 'Search' })
  await searchButton.focus()

  await pressShortcutUntilVisible(page, 'ControlOrMeta+K', input)
  await expect(input).toBeFocused()

  // The closing panel is aria-hidden until its exit animation ends and it unmounts.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('combobox', { name: 'Command palette input', includeHidden: true })).toHaveCount(0)
  await expect(searchButton).toBeFocused()

  await page.keyboard.press('ControlOrMeta+K')
  await expect(input).toBeFocused()
  await page.keyboard.type('tar')
  await expect(page.getByRole('option', { name: /tar\(1\)/i })).toBeVisible()

  // Reopened while the exit animation is still running.
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+K')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
})

test('command palette: @freebsd prefix opens the FreeBSD variant', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Command palette input' }).fill('@freebsd tar')
  // The variant-specific description proves search ran against the FreeBSD dataset.
  await page.getByRole('option', { name: /tar\(1\)/i }).filter({ hasText: 'FreeBSD variant' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1\?distro=freebsd/)
  await expect(page.getByLabel('Select distribution variant')).toHaveValue('freebsd')
  await expect(page.getByText('FreeBSD variant: this page is intentionally different for E2E testing.')).toBeVisible()
})

test('command palette: a flag query opens the page at its option row', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  await page.getByRole('button', { name: 'Search' }).click()

  const input = page.getByRole('combobox', { name: 'Command palette input' })
  await input.fill('tar --create')
  const option = page.getByRole('option', { name: /tar\(1\)/i })
  await expect(option.getByText('flag', { exact: true })).toBeVisible()
  await option.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
})

test('command palette: a flag query on the open page selects the option row in place', async ({ page }) => {
  await page.goto('/man/tar/1')
  await waitForInteractiveShell(page)
  await expect(page.locator('mark[data-bm-opt]')).toHaveCount(0)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Search' }).click()
    const input = page.getByRole('combobox', { name: 'Command palette input' })
    await input.fill('tar --create')
    await page.getByRole('option', { name: /tar\(1\)/i }).click()
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
    await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
  }
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
    .filter({ has: page.locator('button[aria-label="Close keyboard shortcuts, Esc"]') })
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
