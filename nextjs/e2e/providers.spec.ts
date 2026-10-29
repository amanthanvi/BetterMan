import { expect, test } from '@playwright/test'

test('package providers: default and explicit HTML, API, text, OG, and misses', async ({ page, request }) => {
  const route = '/man/foo%3A%3Abar/3pm'
  await page.goto(`${route}?pkg=alternate-perl`)
  await expect(page.getByText('Alternate provider documentation.', { exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/man\/foo%3A%3Abar\/3pm$/)
  await page.goto(route)
  await expect(page.getByText('Perl module documentation.', { exact: true })).toBeVisible()
  for (const pkg of ['', '?pkg=alternate-perl']) {
    const api = await request.get(`/api/v1/man/foo%3A%3Abar/3pm${pkg}`)
    expect(api.status()).toBe(200)
    const result = await api.json()
    expect(result.page.description).toBe(pkg ? 'Alternate package provider' : 'Perl module route fixture')
    const text = await request.get(`${route}.txt${pkg}`)
    expect(text.status()).toBe(200)
    expect(await text.text()).toContain(pkg ? 'Alternate provider documentation.' : 'Perl module documentation.')
    const og = await request.get(`${route}/og${pkg}`)
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')
  }
  const invalid = await request.get('/api/v1/man/foo%3A%3Abar/3pm?pkg=bad%2Fpackage')
  expect(invalid.status()).toBe(200)
  expect((await invalid.json()).page.description).toBe('Perl module route fixture')
  for (const format of [route, `${route}.txt`, `${route}/og`, '/api/v1/man/foo%3A%3Abar/3pm']) {
    expect((await request.get(`${format}?pkg=absent`)).status(), format).toBe(404)
  }
})


test('stub providers redirect to their actual package without a duplicate search page', async ({ page, request }) => {
  await page.goto('/man/foo%3A%3Astub/3pm')
  await expect(page).toHaveURL(/foo%3A%3Abar\/3pm\?pkg=alternate-perl$/)
  await expect(page.getByText('Alternate provider documentation.', { exact: true })).toBeVisible()
  for (const suffix of ['', '?pkg=stub-perl']) {
    const api = await request.get(`/api/v1/man/foo%3A%3Astub/3pm${suffix}`, { maxRedirects: 0 })
    expect(api.status()).toBe(308)
    expect(api.headers()['location']).toContain('pkg=alternate-perl')
    const text = await request.get(`/man/foo%3A%3Astub/3pm.txt${suffix}`)
    expect(text.status()).toBe(200)
    expect(await text.text()).toContain('Alternate provider documentation.')
  }
})
