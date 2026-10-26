import { expect, test } from '@playwright/test'

test('short urls: a bare name answers a 308 to its name page and lands on the only section', async ({ page, request }) => {
  const res = await request.get('/tar', { maxRedirects: 0 })
  expect(res.status()).toBe(308)
  expect(res.headers()['location']).toBe('/man/tar')

  const withDistro = await request.get('/tar?distro=ubuntu', { maxRedirects: 0 })
  expect(withDistro.status()).toBe(308)
  expect(withDistro.headers()['location']).toBe('/man/tar?distro=ubuntu')

  await page.goto('/tar')
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/man\/tar\/1$/)
})

test('short urls: a name in several sections lands on the section picker', async ({ page }) => {
  const res = await page.goto('/printf')
  expect(res?.status()).toBe(200)
  await expect(page).toHaveURL(/\/man\/printf$/)
  await expect(page.getByRole('link', { name: 'printf(3)' })).toBeVisible()
})

test('short urls: name.section and section/name answer a 308 to the page', async ({ page, request }) => {
  for (const [path, location] of [
    ['/tar.1', '/man/tar/1'],
    ['/ssh_config.5', '/man/ssh_config/5'],
    ['/openssl.1ssl', '/man/openssl/1ssl'],
    ['/c++.1', '/man/c%2B%2B/1'],
    ['/2/open', '/man/open/2'],
    ['/3/printf?distro=ubuntu', '/man/printf/3?distro=ubuntu'],
  ]) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(308)
    expect(res.headers()['location'], path).toBe(location)
  }

  await page.goto('/tar.1')
  await expect(page).toHaveURL(/\/man\/tar\/1$/)
  await expect(page.getByRole('heading', { name: /tar\(1\)/i })).toBeVisible()

  await page.goto('/3/printf')
  await expect(page).toHaveURL(/\/man\/printf\/3$/)
  await expect(page.getByRole('heading', { name: /printf\(3\)/i })).toBeVisible()
})

test('short urls: a flag lands on its option row', async ({ page, request }) => {
  for (const path of ['/tar/-c', '/tar/--create', '/tar.1/--create']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(307)
    expect(res.headers()['location'], path).toBe('/man/tar/1#opt-create')
  }
  const withDistro = await request.get('/tar/-c?distro=ubuntu', { maxRedirects: 0 })
  expect(withDistro.headers()['location']).toBe('/man/tar/1?distro=ubuntu#opt-create')

  await page.goto('/tar/--create')
  await expect(page).toHaveURL(/\/man\/tar\/1#opt-create$/)
  await expect(page.locator('mark[data-bm-opt]').filter({ hasText: '--create' }).first()).toBeVisible()
})

test('short urls: an unknown name lands on the man page 404', async ({ page }) => {
  const res = await page.goto('/tarx')
  expect(res?.status()).toBe(404)
  await expect(page).toHaveURL(/\/man\/tarx$/)
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
})

test('short urls: an unknown flag still lands on the page', async ({ request }) => {
  const res = await request.get('/tar/--extract', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toBe('/man/tar')
})

test('short urls: reserved app paths are unaffected', async ({ request }) => {
  for (const path of [
    '/search',
    '/licenses',
    '/bookmarks',
    '/history',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-debian.xml',
    '/opensearch.xml',
    '/favicon.ico',
    '/site.webmanifest',
    '/sw.js',
    '/api/v1/info',
  ]) {
    const res = await request.get(path, { maxRedirects: 0 })
    // `/bookmarks` and `/history` answer their own redirect into the home page.
    expect(res.status(), path).toBeLessThan(400)
    expect(res.headers()['location'] ?? '', path).not.toMatch(/\/man\//)
  }

  for (const path of ['/man', '/api', '/section', '/fonts', '/search/-x', '/man/tar/1/extra', '/.well-known/x', '/a/b/c']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(404)
  }
})

test('short urls: browsers can register BetterMan as a search engine with suggestions', async ({ page, request }) => {
  await page.goto('/')
  const link = page.locator('head link[rel="search"]')
  await expect(link).toHaveAttribute('type', 'application/opensearchdescription+xml')
  await expect(link).toHaveAttribute('title', 'BetterMan')
  const descriptorUrl = new URL((await link.getAttribute('href')) ?? '', page.url()).toString()

  const descriptor = await request.get(descriptorUrl)
  expect(descriptor.status()).toBe(200)
  expect(descriptor.headers()['content-type']).toContain('application/opensearchdescription+xml')
  const xml = await descriptor.text()
  const search = /<Url type="text\/html" method="get" template="([^"]+)"\/>/.exec(xml)?.[1] ?? ''
  const suggest = /<Url type="application\/x-suggestions\+json" method="get" template="([^"]+)"\/>/.exec(xml)?.[1] ?? ''
  expect(search).toMatch(/\/search\?q=\{searchTerms\}$/)
  expect(suggest).toMatch(/\/api\/v1\/suggest\?q=\{searchTerms\}&amp;format=opensearch$/)

  const suggestUrl = new URL(suggest.replace('{searchTerms}', 'ta').replace('&amp;', '&'))
  const suggestions = await request.get(`${suggestUrl.pathname}${suggestUrl.search}`)
  expect(suggestions.status()).toBe(200)
  expect(suggestions.headers()['content-type']).toContain('application/x-suggestions+json')
  const [query, names, , urls] = (await suggestions.json()) as [string, string[], string[], string[]]
  expect(query).toBe('ta')
  expect(names).toContain('tar')
  expect(urls[names.indexOf('tar')]).toMatch(/\/man\/tar\/1$/)

  const searchUrl = new URL(search.replace('{searchTerms}', 'tar'))
  await page.goto(`${searchUrl.pathname}${searchUrl.search}`)
  await expect(page.getByRole('link', { name: /tar\(1\)/ }).first()).toBeVisible()
})

test('short urls: suggestions answer one-letter and two-letter prefixes', async ({ request }) => {
  for (const q of ['t', 'ta']) {
    const res = await request.get(`/api/v1/suggest?q=${q}`)
    expect(res.status(), q).toBe(200)
    const body = (await res.json()) as { suggestions: Array<{ name: string }> }
    expect(body.suggestions.map((s) => s.name), q).toContain('tar')
  }
})

test('short urls: sitemaps keep the canonical /man/ URLs', async ({ request }) => {
  const res = await request.get('/sitemap-debian-1.xml')
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  expect(locs.length).toBeGreaterThan(0)
  for (const loc of locs) expect(loc).toMatch(/^\/man\/[^/]+\/[^/]+$/)
})
