import { expect, test } from '@playwright/test'

test('package providers: default and explicit HTML, API, text, OG, and misses', async ({ page, request }) => {
  const route = '/man/foo%3A%3Abar/3pm'
  await page.goto(`${route}?pkg=alternate-perl`)
  await expect(page.getByText('Alternate provider documentation.', { exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/man\/foo%3A%3Abar\/3pm\?pkg=alternate-perl$/)
  await page.goto(route)
  await expect(page.getByText('Perl module documentation.', { exact: true })).toBeVisible()
  for (const pkg of ['', '?pkg=alternate-perl']) {
    const api = await request.get(`/api/v1/man/foo%3A%3Abar/3pm${pkg}`)
    expect(api.status()).toBe(200)
    expect(api.headers()['x-robots-tag']).toBe(pkg ? 'noindex' : undefined)
    const result = await api.json()
    expect(result.page.description).toBe(pkg ? 'Alternate package provider' : 'Perl module route fixture')
    const text = await request.get(`${route}.txt${pkg}`)
    expect(text.status()).toBe(200)
    expect(text.headers()['link']).toContain(`${route}${pkg}>; rel="canonical"`)
    expect(await text.text()).toContain(pkg ? 'Alternate provider documentation.' : 'Perl module documentation.')
    expect(text.headers()['x-robots-tag']).toBe(pkg ? 'noindex' : undefined)
    const og = await request.get(`${route}/og${pkg}`)
    expect(og.status()).toBe(200)
    expect(og.headers()['x-robots-tag']).toBe(pkg ? 'noindex' : undefined)
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
  await page.goto('/man/foo%3A%3Astub')
  await expect(page).toHaveURL(/foo%3A%3Abar\/3pm\?pkg=alternate-perl$/)
  for (const suffix of ['', '?pkg=stub-perl']) {
    const api = await request.get(`/api/v1/man/foo%3A%3Astub/3pm${suffix}`, { maxRedirects: 0 })
    expect(api.status()).toBe(308)
    expect(api.headers()['location']).toContain('pkg=alternate-perl')
    const text = await request.get(`/man/foo%3A%3Astub/3pm.txt${suffix}`)
    expect(text.status()).toBe(200)
    expect(await text.text()).toContain('Alternate provider documentation.')
  }
})


test('case-only providers: lowercase ftp redirects to tnftp, uppercase FTP and package selector serve GNUstep', async ({ page, request }) => {
  await page.goto('/man/ftp/1')
  await expect(page).toHaveURL(/\/man\/tnftp\/1(?:\?pkg=tnftp)?$/)
  await expect(page.getByText('Terminal FTP documentation.', { exact: true })).toBeVisible()
  for (const route of ['/man/FTP/1', '/man/ftp/1?pkg=ftp.app']) {
    await page.goto(route)
    await expect(page.getByText('GNUstep FTP documentation.', { exact: true })).toBeVisible()
  }
  for (const [name, suffix] of [['FTP', ''], ['ftp', '?pkg=ftp.app']]) {
    const api = await request.get(`/api/v1/man/${name}/1${suffix}`)
    expect(api.status()).toBe(200)
    expect((await api.json()).page.sourcePackage).toBe('ftp.app')
    const text = await request.get(`/man/${name}/1.txt${suffix}`)
    expect(await text.text()).toContain('GNUstep FTP documentation.')
    const og = await request.get(`/man/${name}/1/og${suffix}`)
    expect(og.status()).toBe(200)
  }
})


test('provided by works with keyboard and no JavaScript, keeps distro, and omits single providers', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await context.newPage()
  await page.goto('/man/foo%3A%3Abar/3pm?distro=ubuntu')
  const summary = page.locator('[data-bm-providers] summary')
  await expect(summary).toHaveText('Provided by perl')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('BetterMan’s default for this release.', { exact: false })).toBeVisible()
  const alternate = page.getByRole('list', { name: 'Package providers' }).getByRole('link', { name: 'alternate-perl', exact: true })
  await expect(alternate).toHaveAttribute('href', '/man/foo%3A%3Abar/3pm?distro=ubuntu&pkg=alternate-perl')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'How the default is chosen' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(alternate).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Alternate provider documentation.', { exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\?distro=ubuntu&pkg=alternate-perl$/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await page.locator('[data-bm-providers] summary').click()
  await expect(page.getByRole('link', { name: 'alternate-perl', exact: true })).toHaveAttribute('aria-current', 'page')
  const defaultLink = page.getByRole('list', { name: 'Package providers' }).getByRole('link', { name: 'perl', exact: true })
  await expect(defaultLink).toHaveAttribute('href', '/man/foo%3A%3Abar/3pm?distro=ubuntu')
  await defaultLink.click()
  await expect(page.getByText('Perl module documentation.', { exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/3pm\?distro=ubuntu$/)
  await page.goto('/man/tar/1')
  await expect(page.locator('[data-bm-providers]')).toHaveCount(0)
  await context.close()
})


test('provider robots and canonicals distinguish winner, identical and different content', async ({ page, request }) => {
  const route = '/man/foo%3A%3Abar/3pm'
  for (const [pkg, self, noindex] of [['perl', false, false], ['same-perl', false, true], ['alternate-perl', true, true]] as const) {
    await page.goto(`${route}?pkg=${pkg}`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/3pm${self ? '\\?pkg=alternate-perl' : ''}$`))
    if (noindex) await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    else await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    for (const suffix of ['.txt', '/og']) {
      const response = await request.get(`${route}${suffix}?pkg=${pkg}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['x-robots-tag']).toBe(noindex ? 'noindex' : undefined)
      if (suffix === '.txt') expect(response.headers()['link']).toContain(`${route}${self ? '?pkg=alternate-perl' : ''}>; rel="canonical"`)
    }
    for (const suffix of ['', '/meta']) {
      const response = await request.get(`/api/v1/man/foo%3A%3Abar/3pm${suffix}?pkg=${pkg}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['x-robots-tag']).toBe(noindex ? 'noindex' : undefined)
    }
  }
  const sitemap = await request.get('/sitemap-debian-1.xml')
  expect(await sitemap.text()).not.toContain('pkg=')
  await page.goto('/man/ftp?pkg=ftp.app')
  await expect(page.getByText('Terminal FTP documentation.', { exact: true })).toBeVisible()
  await page.goto('/man/FTP/1')
  await page.locator('[data-bm-providers] summary').click()
  await expect(page.getByText('BetterMan’s default for this release.', { exact: false })).toHaveCount(0)
})
