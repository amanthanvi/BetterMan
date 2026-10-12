import { expect, test } from '@playwright/test'

import { shot } from './evidence'

test('smoke: home search opens tar(1)', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: 'Search man pages' })
  await expect(search).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible()
  await shot(page, 'smoke-home')

  await search.fill('tar')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=tar/)
  const result = page.getByRole('link', { name: /tar\(1\)/i })
  await expect(result).toBeVisible()
  await shot(page, 'smoke-search')

  await result.click()
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Command-line options' })).toBeVisible()
  await shot(page, 'smoke-tar')
})
