import { expect, test, type Page, type Request } from '@playwright/test'

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

test('navigation: a link into a man page dims while its payload is pending', async ({ page }) => {
  await page.goto('/section/1')
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
