import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('man: renders page chrome (Navigator rail)', async ({ page }) => {
  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByText('Navigator')).toBeVisible()
  await expect(page.getByText('Find')).toBeVisible()
  await expect(page.getByText('On this page')).toBeVisible()
})

test('man: mobile TOC drawer opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/man/tar/1')
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  const tocButton = page.getByRole('button', { name: 'TOC' })
  await expect(tocButton).toBeVisible({ timeout: 10_000 })
  await tocButton.click()

  await expect(page.getByRole('heading', { name: 'Table of contents' })).toBeVisible()
  await expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('man: find-in-page highlights matches', async ({ page }) => {
  await page.goto('/man/tar/1')
  await page.getByRole('textbox', { name: 'Find in page' }).fill('tar')
  await expect(page.locator('mark[data-bm-find]').first()).toBeVisible()
})

test('man: TOC navigation updates the URL hash', async ({ page }) => {
  await page.goto('/man/tar/1')
  const toc = page.locator('nav[aria-label="On this page"]')
  const examples = toc.getByRole('link', { name: 'EXAMPLES' })

  await examples.click()
  await expect(page).toHaveURL(/\/man\/tar\/1#examples$/)
  await expect(examples).toHaveAttribute('class', /bg-\[color:var\(--bm-accent\)\/0\.12\]/)
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
