import { expect, test, type Page, type Request } from '@playwright/test'

import { RECENT_STORAGE_KEY } from '../lib/recent'
import { waitForInteractiveShell } from './shortcuts'

function isPrefetch(request: Request): boolean {
  const headers = request.headers()
  return 'next-router-prefetch' in headers || 'next-router-segment-prefetch' in headers
}

// Holds every navigation payload (not prefetches) so a navigation stays pending
// long enough to observe the feedback shown while it is.
async function delayNavigations(page: Page, ms: number) {
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.headers()['rsc'] === '1' && !isPrefetch(request)) {
      await new Promise((resolve) => setTimeout(resolve, ms))
    }
    await route.continue()
  })
}

async function interceptRSC(page: Page, pathname: string) {
  let release!: () => void
  let onRequest!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const requested = new Promise<void>((resolve) => { onRequest = resolve })
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.headers()['rsc'] === '1' && !isPrefetch(request) && new URL(request.url()).pathname === pathname) {
      onRequest()
      await held
    }
    await route.continue()
  })
  return { requested, release }
}

test('navigation: palette page navigation shows feedback after closing until the payload arrives', async ({ page }) => {
  await page.goto('/')
  await waitForInteractiveShell(page)
  // Fresh contexts get this attribute after React attaches the shell listeners.
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Command palette input' }).fill('tar --create')
  const option = page.getByRole('option', { name: /tar\(1\)/i })
  await expect(option).toBeVisible()

  const navigation = await interceptRSC(page, '/man/tar/1')
  const pending = page.getByRole('status', { name: 'Navigation', exact: true })
  try {
    await option.click()
    await navigation.requested
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await expect(pending).toHaveText('Loading…')
    await expect(pending).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  } finally {
    navigation.release()
  }
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
  await expect(pending).toBeEmpty()
  await expect(page.locator('#main-content')).toBeFocused()
})

test('navigation: palette search shows feedback for a query-only navigation and clears on a repeated search', async ({ page }) => {
  await page.goto('/search?q=grep')
  await waitForInteractiveShell(page)
  // Fresh contexts get this attribute after React attaches the shell listeners.
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, items: [{ kind: 'search', query: 'tar', at: Date.now() }] }))
  }, RECENT_STORAGE_KEY)
  await page.getByRole('button', { name: 'Search' }).click()
  const option = page.getByRole('option', { name: /tar/ })
  await expect(option).toBeVisible()

  const navigation = await interceptRSC(page, '/search')
  const pending = page.getByRole('status', { name: 'Navigation', exact: true })
  try {
    await option.click()
    await navigation.requested
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await expect(pending).toHaveText('Loading…')
    await expect(pending).toBeVisible()
    await expect(page).toHaveURL(/\/search\?q=grep$/)
  } finally {
    navigation.release()
  }
  await expect(page).toHaveURL(/\/search\?q=tar$/)
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toHaveValue('tar')
  await expect(pending).toBeEmpty()

  await page.getByRole('button', { name: 'Search' }).click()
  await option.click()
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  await expect(pending).toBeEmpty()
  await expect(page).toHaveURL(/\/search\?q=tar$/)
})

test('navigation: distro replacement shows feedback until its query-only payload arrives and keeps the hash', async ({ page }) => {
  await page.goto('/man/tar/1#synopsis')
  await waitForInteractiveShell(page)
  // Fresh contexts get this attribute after React attaches the shell listeners.
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
  const pending = page.getByRole('status', { name: 'Navigation', exact: true })
  const navigation = await interceptRSC(page, '/man/tar/1')
  try {
    await page.getByLabel('Select distribution variant').selectOption('freebsd')
    await navigation.requested
    await expect(pending).toHaveText('Loading…')
    await expect(pending).toBeVisible()
    await expect(page).toHaveURL(/\/man\/tar\/1#synopsis$/)
  } finally {
    navigation.release()
  }
  await expect(page).toHaveURL(/\/man\/tar\/1\?distro=freebsd#synopsis$/)
  await expect(page.getByText('FreeBSD variant: this page is intentionally different for E2E testing.')).toBeVisible()
  await expect(pending).toBeEmpty()

  await page.getByLabel('Select distribution variant').selectOption('debian')
  await expect(page).toHaveURL(/\/man\/tar\/1#synopsis$/)
  await expect(page.getByLabel('Select distribution variant')).toHaveValue('debian')
  await expect(pending).toBeEmpty()
})

test('navigation: a link into a man page dims while its payload is pending', async ({ page }) => {
  // A completed prefetch can satisfy the navigation before the pending state appears.
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).pathname === '/man/tar/1' && isPrefetch(route.request())) await route.abort()
    else await route.continue()
  })
  await page.goto('/section/1')
  await waitForInteractiveShell(page)
  const link = page.getByRole('link', { name: /^tar\(1\)/ })
  await expect(link).toHaveCSS('opacity', '1')

  await delayNavigations(page, 1500)
  await link.click()
  await expect(link).toHaveCSS('opacity', '0.55')
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
})

test('navigation: a link to the home page shows its prefetched skeleton while the payload is pending', async ({ page }) => {
  const prefetched = page.waitForResponse((res) => new URL(res.url()).pathname === '/' && isPrefetch(res.request()))
  await page.goto('/definitely/not/a-route')
  await prefetched
  // A still in-flight prefetch would complete the navigation without the skeleton.
  await page.waitForLoadState('networkidle')

  await delayNavigations(page, 1500)
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search man pages' })).toBeVisible()
})
