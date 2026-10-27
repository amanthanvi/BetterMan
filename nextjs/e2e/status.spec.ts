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

test('status: a man page miss answers a noindex 404 with man’s voice and its suggestions in the response', async ({ request }) => {
  // Next serves a notFound() 404 as an error shell that the browser renders from
  // the RSC data inlined in the same response, so the text is in the body
  // without any further request, but not as server-rendered markup.
  for (const [path, expected] of [
    ['/man/gizp', ['No manual entry for gizp', 'Did you mean', '/man/gzip/1']],
    ['/man/tar/9', ['No manual entry for tar in section 9', 'Did you mean', '/man/tar/1']],
    [
      '/man/systemctl/1?distro=macos',
      [
        'No manual entry for systemctl in section 1',
        'BSD-licensed subset of the manual pages macOS ships',
        'Other distributions',
        '/man/systemctl/1?distro=debian',
        '/man/systemctl/1?distro=fedora',
      ],
    ],
  ] as const) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
    const html = await res.text()
    expect(html, path).toMatch(/<meta name="robots" content="noindex"/)
    expect(html, path).toContain('<title>Not found — BetterMan</title>')
    for (const text of expected) expect(html, path).toContain(text)
  }
})

test('status: missing pages and sections answer 404', async ({ request }) => {
  for (const path of ['/man/definitely-not-a-page-xyz', '/man/tar/9', '/section/zzz', '/definitely/not/a-route']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
    const html = await res.text()
    expect(html, path).toContain('<title>Not found — BetterMan</title>')
    expect(html, path).toMatch(/<meta name="robots" content="noindex"/)
  }
  expect(await (await request.get('/section/zzz')).text()).toContain('No such file or directory')
})

test('status: found and ambiguous names answer 200', async ({ request }) => {
  for (const path of ['/man/tar/1', '/man/printf']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
  }
})
