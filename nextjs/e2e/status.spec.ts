import { expect, test } from '@playwright/test'

test('status: a bare name answers a 307 to its only section and keeps ?distro=', async ({ request }) => {
  const res = await request.get('/man/tar', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toBe('/man/tar/1')

  const withDistro = await request.get('/man/tar?distro=ubuntu', { maxRedirects: 0 })
  expect(withDistro.status()).toBe(307)
  expect(withDistro.headers()['location']).toBe('/man/tar/1?distro=ubuntu')
})

test('status: a .so alias redirects to its target, permanently only for an explicit distro', async ({ request }) => {
  // A bare request resolved the alias on the stored default, which can change.
  const res = await request.get('/man/gunzip/1', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toBe('/man/gzip/1')

  for (const cookie of [undefined, 'bm-distro=ubuntu']) {
    const explicit = await request.get('/man/gunzip/1?distro=debian', { maxRedirects: 0, headers: cookie ? { cookie } : {} })
    expect(explicit.status()).toBe(308)
    expect(explicit.headers()['location']).toBe('/man/gzip/1?distro=debian')
  }
})

test('status: missing pages and sections answer 404', async ({ request }) => {
  for (const path of ['/man/definitely-not-a-page-xyz', '/man/tar/9', '/section/zzz']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
    expect(await res.text(), path).toContain('Not found')
  }
})

test('status: found and ambiguous names answer 200', async ({ request }) => {
  for (const path of ['/man/tar/1', '/man/printf']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
  }
})
