import { test, expect } from '@playwright/test'

import { expectNoCriticalOrSeriousViolations } from './a11y'

test('not found: renders and can go home', async ({ page }) => {
  // One segment is a short man page URL (`/tar`), so use a path no route takes.
  const res = await page.goto('/definitely/not/a-route')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'No such file or directory' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
})

test('not found: a missing man page is a noindex 404 in man’s voice that suggests nearby names', async ({ page }) => {
  const res = await page.goto('/man/ta/9')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No manual entry for ta in section 9')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const search = page.getByRole('link', { name: 'Search for “ta”' })
  await expect(search).toHaveAttribute('href', '/search?q=ta')
  await page.getByRole('region', { name: 'Did you mean' }).getByRole('link', { name: 'tar(1)' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
})

test('not found: a misspelled name suggests the page within two edits', async ({ page }) => {
  const res = await page.goto('/man/gizp')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No manual entry for gizp')
  const suggestions = page.getByRole('region', { name: 'Did you mean' })
  await expect(suggestions.getByRole('link')).toHaveText(['gzip(1)'])
  await expectNoCriticalOrSeriousViolations(page)
})

test('not found: for a distro without a release, suggestions fall back to Debian and keep the URL distro', async ({ page }) => {
  const res = await page.goto('/man/ta/9?distro=arch')
  expect(res?.status()).toBe(404)
  await page.getByRole('link', { name: 'tar(1)' }).click()
  await expect(page).toHaveURL(/\/man\/tar\/1\?distro=arch$/)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('not found: a macOS miss explains the BSD-licensed subset and lists the distros that have the page', async ({ page }) => {
  for (const path of ['/man/systemctl/1?distro=macos', '/man/systemctl?distro=macos']) {
    const res = await page.goto(path)
    expect(res?.status(), path).toBe(404)
    await expect(page.getByText('BetterMan carries only the BSD-licensed subset of the manual pages macOS ships')).toBeVisible()
    const others = page.getByRole('region', { name: 'Other distributions' })
    await expect(others.getByRole('link')).toHaveText(['Debian', 'Ubuntu', 'Fedora'])
  }
  await page.getByRole('region', { name: 'Other distributions' }).getByRole('link', { name: 'Fedora' }).click()
  await expectNoCriticalOrSeriousViolations(page)
  // The bare name goes on to its only section.
  await expect(page).toHaveURL(/\/man\/systemctl\/1\?distro=fedora$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('systemctl')
})
