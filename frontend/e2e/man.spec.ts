import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('man: navigator panel opens and contains TOC + Find', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const openNavigator = page.getByRole('button', { name: 'Open navigator' })
  await expect(openNavigator).toBeVisible()
  await openNavigator.click()

  const dialog = page.getByRole('dialog', { name: 'Navigator' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Quick jumps')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Find in page' })).toBeVisible()
  await expect(dialog.getByText('Contents')).toBeVisible()
})

test('man: mobile TOC drawer opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const openNavigator = page.getByRole('button', { name: 'Open navigator' })
  await expect(openNavigator).toBeVisible({ timeout: 10_000 })
  await openNavigator.click()

  await expect(page.getByRole('dialog', { name: 'Table of contents' })).toBeVisible()
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: find-in-page highlights matches', async ({ page }) => {
  await page.goto('/man/tar/1')

  await page.getByRole('button', { name: 'Open navigator' }).click()
  await expect(page.getByRole('dialog', { name: 'Navigator' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Find in page' }).fill('tar')
  await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()
})

test('man: TOC navigation updates the URL hash', async ({ page }) => {
  await page.goto('/man/tar/1')

  await page.getByRole('button', { name: 'Open navigator' }).click()
  const dialog = page.getByRole('dialog', { name: 'Navigator' })
  await expect(dialog).toBeVisible()

  const toc = dialog.locator('nav[aria-label="On this page"]')
  const examples = toc.getByRole('link', { name: 'EXAMPLES' })

  await examples.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#examples$/)
  await expect(examples).toHaveAttribute('class', /border-\[var\(--bm-accent\)\]/)
})

test('man: extended section URLs work', async ({ page }) => {
  await page.goto('/man/openssl/1ssl')
  await expect(page.getByRole('heading', { name: /openssl\(1ssl\)/i })).toBeVisible()
})

test('man: distro variant selector swaps content', async ({ page }) => {
  await page.goto('/man/tar/1?distro=debian')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const marker = page.getByText(
    'Ubuntu variant: this page is intentionally different for E2E testing.',
  )
  await expect(marker).toHaveCount(0)

  const variantSelect = page.getByLabel('Select distribution variant')
  await expect(variantSelect).toBeVisible()
  await variantSelect.selectOption('ubuntu')

  await expect(marker).toBeVisible()
})

test('man: ambiguous by-name route renders picker', async ({ page }) => {
  await page.goto('/man/printf')
  await expect(page.getByRole('heading', { name: 'printf' })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(1\)/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /printf\(3\)/i })).toBeVisible()
})

test('man: a11y (no critical/serious violations)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expectNoCriticalOrSeriousViolations(page)
})
