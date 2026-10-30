import { expect, test } from '@playwright/test'

test('plain text: canonical and short routes answer without page JavaScript', async ({ request }) => {
  const bodies: string[] = []
  for (const path of ['/tar.txt', '/tar.1.txt', '/man/tar/1.txt']) {
    const res = await request.get(path, { headers: { 'User-Agent': 'curl/8.0' } })
    expect(res.status(), path).toBe(200)
    expect(res.headers()['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.headers()['cache-control']).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=3600')
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['link']).toMatch(/<https?:\/\/[^>]+\/man\/tar\/1>; rel="canonical"/)
    const body = await res.text()
    for (const text of ['TAR(1)', 'NAME', 'SYNOPSIS', 'OPTIONS', 'EXAMPLES', 'tar [OPTION]', '-c, --create', 'tar -cf archive.tar ./my-folder']) expect(body).toContain(text)
    expect(body).not.toContain('<html')
    bodies.push(body)
    const head = await request.head(path)
    expect(head.status()).toBe(200)
    expect(head.headers()['link']).toBe(res.headers()['link'])
    expect(await head.text()).toBe('')
  }
  expect(bodies[0]).toBe(bodies[1])
})

test('plain text: distro, missing pages, ambiguous names, and aliases', async ({ request }) => {
  for (const path of ['/tar.txt', '/tar.1.txt', '/man/tar/1.txt']) {
    const res = await request.get(`${path}?distro=ubuntu`)
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('Ubuntu variant:')
    expect(res.headers()['link']).toContain('/man/tar/1?distro=ubuntu>')
  }
  for (const path of ['/not-a-real-page.txt', '/man/not-a-real-page/1.txt', '/man/tar/9.txt']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
    expect(res.headers()['content-type']).toContain('text/plain')
  }
  // An invalid distro is dropped by the query allowlist before the export answers.
  const invalid = await request.get('/tar.txt?distro=invalid', { maxRedirects: 0 })
  expect(invalid.status()).toBe(308)
  expect(invalid.headers()['location']).toBe('/tar.txt')
  const ambiguous = await request.get('/printf.txt')
  expect(ambiguous.status()).toBe(409)
  expect(await ambiguous.text()).toContain('/man/printf/3.txt')
  for (const path of ['/gunzip.txt', '/man/gunzip/1.txt']) {
    const alias = await request.get(path, { maxRedirects: 0 })
    expect(alias.status()).toBe(308)
    expect(alias.headers()['location']).toBe('/man/gzip/1.txt')
    expect((await request.get(path)).headers()['content-type']).toContain('text/plain')
  }
})

test('plain text: robots.txt stays a concrete route with answer-engine policy', async ({ request }) => {
  const res = await request.get('/robots.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('User-agent: GPTBot')
  expect(body).toContain('Allow: /\nDisallow: /api/')
  expect(body).toContain('/sitemap.xml')
})

test('plain text: origin GETs use the page limit without charging HTML or the descriptor', async ({ request, baseURL }) => {
  // Only a local server trusts this test IP; production replaces it at ingress.
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Requires an isolated local backend')
  test.setTimeout(60_000)
  const remaining = 60_000 - Date.now() % 60_000
  if (remaining < 20_000) await new Promise((resolve) => setTimeout(resolve, remaining + 50))
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  const headers = { 'x-vercel-forwarded-for': `2001:db8::${suffix.slice(0, 4)}:${suffix.slice(4)}` }
  for (let index = 0; index < 300; index += 1) {
    const res = await request.get(index % 2 ? '/tar.1.txt' : '/man/tar/1.txt', { headers })
    expect(res.status(), `request ${index + 1}`).toBe(200)
  }
  for (const path of ['/tar.txt', '/tar.1.txt', '/man/tar/1.txt', '/api/v1/man/tar/1', '/man/tar/1/og']) {
    const res = await request.get(path, { headers })
    expect(res.status(), path).toBe(429)
    expect(res.headers()['cache-control']).toContain('private')
    expect(res.headers()['content-security-policy']).toBeTruthy()
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['strict-transport-security']).toContain('max-age=31536000')
  }
  const prefetch = await request.get('/man/tar/1', { headers: { ...headers, purpose: 'prefetch', 'next-router-prefetch': '1' } })
  expect(prefetch.status()).toBe(200)
  expect((await request.get('/opensearch.xml', { headers })).status()).toBe(200)
  const head = await request.head('/man/tar/1.txt', { headers: { ...headers, purpose: 'prefetch', 'next-router-prefetch': '1' } })
  expect(head.status()).toBe(429)
  expect(await head.text()).toBe('')
  expect(head.headers()['content-security-policy']).toBeTruthy()
  expect(head.headers()['x-content-type-options']).toBe('nosniff')
  expect(head.headers()['strict-transport-security']).toContain('max-age=31536000')
  for (const path of ['/api/v1/man/tar/1', '/man/tar/1/og']) {
    const denied = await request.head(path, { headers: { ...headers, purpose: 'prefetch' } })
    expect(denied.status()).toBe(429)
    expect(denied.headers()['content-security-policy']).toBeTruthy()
    expect(denied.headers()['x-content-type-options']).toBe('nosniff')
    expect(denied.headers()['strict-transport-security']).toContain('max-age=31536000')
  }
})
