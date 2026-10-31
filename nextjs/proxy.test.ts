import { createHash } from 'node:crypto'

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const release = vi.hoisted(() => ({ servingRelease: vi.fn() }))
vi.mock('./lib/manRelease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/manRelease')>()),
  servingRelease: release.servingRelease,
}))

import { ANALYTICS_BOOT_SCRIPT } from './lib/analyticsBoot'
import { MAN_BOOT_SCRIPT } from './lib/manBoot'
import { holdBack, releaseHeld } from './lib/i18n/testing'

process.env.BM_RELEASE_TOKEN = 'test-release-token'
import { config, isConceptHtmlPath, isManHtmlPath, proxy } from './proxy'

const bootHash = `'sha256-${createHash('sha256').update(MAN_BOOT_SCRIPT).digest('base64')}'`
const releaseFor = (distro: string) => ({ datasetReleaseId: `2026-10-28+${distro}`, distro, pageCount: 10, lastUpdated: '2026-10-28T00:00:00Z' })

beforeEach(() => {
  release.servingRelease.mockReset()
  release.servingRelease.mockImplementation(async (distro: string) => releaseFor(distro))
})
afterEach(() => {
  vi.unstubAllEnvs()
  releaseHeld()
})

it('keeps production CSP self-only for analytics and issues a fresh nonce per request', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js' } }))
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
  const first = await proxy(new NextRequest('https://betterman.sh/'))
  const second = await proxy(new NextRequest('https://betterman.sh/'))
  const csp = first.headers.get('content-security-policy')!
  expect(csp).toContain("connect-src 'self';")
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(csp).toMatch(/script-src-elem 'self' 'nonce-[^']+';/)
  expect(csp).not.toMatch(/https?:|unsafe-eval|script-src[^;]*unsafe-inline/)
  expect(second.headers.get('content-security-policy')).not.toBe(csp)
  expect(csp).toContain(`'nonce-${first.headers.get('x-middleware-request-x-nonce')}'`)
  expect(first.headers.get('x-content-type-options')).toBe('nosniff')
})

it('serves man pages under a hash-only CSP with no nonce, so the HTML can be cached', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1'))
  const csp = response.headers.get('content-security-policy')!
  expect(csp).toContain(`script-src 'self' ${bootHash};`)
  expect(csp).toContain(`script-src-elem 'self' ${bootHash};`)
  expect(csp).not.toMatch(/nonce|strict-dynamic|unsafe-eval|script-src[^;]*unsafe-inline/)
  expect(response.headers.get('x-middleware-request-x-nonce')).toBeNull()
  expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
})

it('serves concept explainers under the same hash-only CSP, with no release lookup or distro redirect', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const request = new NextRequest('https://betterman.sh/concept/signals', { headers: { cookie: 'bm-distro=freebsd' } })
  const response = await proxy(request)
  const csp = response.headers.get('content-security-policy')!
  expect(csp).toContain(`script-src 'self' ${bootHash};`)
  expect(csp).not.toMatch(/nonce|strict-dynamic/)
  expect(response.status).toBe(200)
  expect(response.headers.get('location')).toBeNull()
  expect(release.servingRelease).not.toHaveBeenCalled()
  expect(isConceptHtmlPath('/concept/signals')).toBe(true)
  // A prefetch must not slip past the proxy into a cacheable, CSP-less response.
  for (const headers of [{ 'next-router-prefetch': '1' }, { purpose: 'prefetch' }] as Record<string, string>[]) {
    expect(unstable_doesMiddlewareMatch({ config, url: '/concept/signals', headers })).toBe(true)
    const prefetched = await proxy(new NextRequest('https://betterman.sh/concept/signals', { headers }))
    expect(prefetched.headers.get('content-security-policy')).toContain(`script-src 'self' ${bootHash};`)
    expect(prefetched.headers.get('x-frame-options')).toBe('DENY')
    const stray = await proxy(new NextRequest('https://betterman.sh/concept/signals?utm_source=x', { headers }))
    expect(stray.status).toBe(308)
    expect(stray.headers.get('location')).toBe('https://betterman.sh/concept/signals')
  }
  // Explainers are English only for now (B9, #475): `?lang=` goes back to the bare URL.
  const lang = await proxy(new NextRequest('https://betterman.sh/concept/signals?lang=de&distro=arch'))
  expect(lang.status).toBe(308)
  expect(lang.headers.get('location')).toBe('https://betterman.sh/concept/signals?distro=arch')
  for (const path of ['/concept', '/concept/signals/x', '/concepts/signals']) expect(isConceptHtmlPath(path)).toBe(false)
  // One cache entry per meaning, as for man pages: only a valid ?distro= survives.
  const messy = await proxy(new NextRequest('https://betterman.sh/concept/signals?utm_source=x&distro=arch&distro=freebsd&pkg=y'))
  expect(messy.status).toBe(308)
  expect(messy.headers.get('location')).toBe('https://betterman.sh/concept/signals?distro=arch')
  expect((await proxy(new NextRequest('https://betterman.sh/concept/signals?distro=arch'))).status).toBe(200)
})

it('keys a man page on the active release and forwards it to the renderer', async () => {
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1?distro=fedora', { headers: { 'x-bm-release': '{"spoofed":true}' } }))
  expect(release.servingRelease).toHaveBeenCalledWith('fedora')
  const rewrite = new URL(response.headers.get('x-middleware-rewrite')!)
  expect(rewrite.pathname).toBe('/man/tar/1')
  expect(rewrite.searchParams.get('distro')).toBe('fedora')
  expect(rewrite.searchParams.get('__bm_release')).toBe('2026-10-28+fedora')
  expect(JSON.parse(response.headers.get('x-middleware-request-x-bm-release')!)).toMatchObject({ datasetReleaseId: '2026-10-28+fedora' })
  expect(response.headers.get('x-middleware-request-x-bm-release-token')).toBe('test-release-token')
})

it('drops a client-sent release and uses an unknown key when no release answers', async () => {
  release.servingRelease.mockResolvedValue(null)
  const forged = await proxy(new NextRequest('https://betterman.sh/man/tar/1?__bm_release=forged'))
  expect(forged.status).toBe(308)
  expect(forged.headers.get('location')).toBe('https://betterman.sh/man/tar/1')
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1', { headers: { 'x-bm-release': JSON.stringify(releaseFor('debian')) } }))
  expect(new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('__bm_release')).toBe('unknown')
  expect(response.headers.get('x-middleware-request-x-bm-release')).toBe('unknown')
  expect(response.headers.get('x-middleware-request-x-bm-release-token')).toBe('test-release-token')
})

it.each([
  ['/man/tar/1', 'ubuntu', '/man/tar/1?distro=ubuntu'],
  ['/man/tar', 'macos', '/man/tar?distro=macos'],
  ['/man/tar/1?pkg=tar', 'fedora', '/man/tar/1?pkg=tar&distro=fedora'],
])('sends a bare %s with a %s default to the explicit URL, privately', async (path, cookie, location) => {
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { cookie: `bm-distro=${cookie}` } }))
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get('location')!)
  expect(`${target.pathname}${target.search}`).toBe(location)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(release.servingRelease).not.toHaveBeenCalled()
})

it.each([
  ['/man/tar/1', 'debian'],
  ['/man/tar/1?distro=debian', 'ubuntu'],
  ['/man/tar/1?distro=ubuntu', 'macos'],
])('renders %s with a %s cookie without depending on it', async (path, cookie) => {
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { cookie: `bm-distro=${cookie}` } }))
  expect(response.status).toBe(200)
  expect(response.headers.get('x-middleware-rewrite')).toContain('__bm_release=')
  expect(response.headers.get('set-cookie')).toBeNull()
})

it('keys text exports without applying the HTML distro cookie', async () => {
  for (const path of ['/man/tar/1.txt', '/man/tar/1/og', '/man', '/man/tar/1/extra', '/tar']) expect(isManHtmlPath(path)).toBe(false)
  // A one-segment name ending in .txt is no text export: the man page renderer answers it.
  expect(isManHtmlPath('/man/ls.txt')).toBe(true)
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1.txt', { headers: { cookie: 'bm-distro=ubuntu' } }))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-security-policy')).toContain("'nonce-")
  expect(new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('__bm_release')).toBe('2026-10-28+debian')
  expect(release.servingRelease).toHaveBeenCalledWith('debian')
})

it.each(['/api', '/api/v1/info', '/api/v1/man/tar/1', '/assets', '/_bm/man.0123456789abcdef.js'])('skips API and asset routes: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
})

it.each(['/man/tar/1', '/man/tar'])('runs for man page prefetches as well: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url, headers: { 'next-router-prefetch': '1' } })).toBe(true)
  expect(unstable_doesMiddlewareMatch({ config, url, headers: { purpose: 'prefetch' } })).toBe(true)
})

it.each(['/', '/apiary', '/api-docs', '/assets-guide', '/man/api/3', '/tar', '/tar.1', '/2/open', '/tar/-x', '/opensearch.xml'])('sets CSP on pages: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
})

it('sends a full load of a home query to the search page, but keeps client navigations inline', async () => {
  const status = async (url: string, headers: Record<string, string> = {}) => (await proxy(new NextRequest(url, { headers }))).status
  const full = await proxy(new NextRequest('https://betterman.sh/?q=tar&distro=fedora'))
  expect(full.status).toBe(307)
  expect(full.headers.get('location')).toBe('https://betterman.sh/search?q=tar&distro=fedora')
  expect(full.headers.get('x-content-type-options')).toBe('nosniff')
  expect(await status('https://betterman.sh/?q=tar', { rsc: '1' })).toBe(200)
  expect(await status('https://betterman.sh/?q=tar', { 'sec-fetch-dest': 'empty' })).toBe(200)
  expect(await status('https://betterman.sh/?q=tar&_rsc=abc')).toBe(200)
  expect(await status('https://betterman.sh/?q=tar', { 'sec-fetch-dest': 'document' })).toBe(307)
  expect(await status('https://betterman.sh/?q=')).toBe(200)
  expect(await status('https://betterman.sh/')).toBe(200)
})

it.each(['/explain?cmd=tar%20-x', '/search?q=tar'])('keeps the nonce CSP on %s', async (url) => {
  vi.stubEnv('NODE_ENV', 'production')
  const csp = (await proxy(new NextRequest(`https://betterman.sh${url}`))).headers.get('content-security-policy')!
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
})


it.each(['/tar.txt', '/tar.1.txt', '/man/tar/1.txt'])('keys text URL and its prefetch on the active release: %s', async (path) => {
  expect(unstable_doesMiddlewareMatch({ config, url: path, headers: { purpose: 'prefetch' } })).toBe(true)
  const forged = await proxy(new NextRequest(`https://betterman.sh${path}?__bm_release=forged&distro=ubuntu`))
  expect(forged.status).toBe(308)
  expect(forged.headers.get('location')).toBe(`https://betterman.sh${path}?distro=ubuntu`)
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`))
  expect(new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('__bm_release')).toBe('2026-10-28+debian')
})

it('keeps explicit provider selectors in the release-keyed CDN rewrite', async () => {
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1?pkg=alternate&distro=ubuntu'))
  const target = new URL(response.headers.get('x-middleware-rewrite')!)
  expect(target.searchParams.get('pkg')).toBe('alternate')
  expect(target.searchParams.get('distro')).toBe('ubuntu')
  expect(target.searchParams.get('__bm_release')).toBe('2026-10-28+ubuntu')
})

describe('man page query allowlist', () => {
  it.each([
    ['/man/tar/1?zz=1', '/man/tar/1'],
    ['/man/tar/1?zz=1&zz=2&utm_source=hn', '/man/tar/1'],
    ['/man/tar/1?flag=-c&flag=-x', '/man/tar/1?flag=-c'],
    ['/man/tar/1?flag=-%63', '/man/tar/1?flag=-c'],
    ['/man/tar/1?flag=nope&distro=ubuntu', '/man/tar/1?distro=ubuntu'],
    ['/man/tar/1?flag=-c&distro=ubuntu&zz=1', '/man/tar/1?flag=-c&distro=ubuntu'],
    ['/man/tar/1?distro=Ubuntu&portability=glyph&lang=en', '/man/tar/1'],
    ['/man/tar/1?pkg=g++', '/man/tar/1?pkg=g%2B%2B'],
    ['/man/tar/1?_rsc=abc', '/man/tar/1'],
    ['/man/tar?flag=-x&distro=arch', '/man/tar?distro=arch'],
    ['/man/tar/1.txt?zz=1', '/man/tar/1.txt'],
    ['/tar.1.txt?distro=ubuntu&x=1', '/tar.1.txt?distro=ubuntu'],
    ['/man/tar/1/og?zz=1', '/man/tar/1/og'],
    ['/man/tar/1/og?distro=junk&flag=-x&portability=text', '/man/tar/1/og?flag=-x'],
  ])('redirects %s to %s, privately and before any release lookup', async (path, location) => {
    const response = await proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { cookie: 'bm-distro=fedora' } }))
    expect(response.status).toBe(308)
    const target = new URL(response.headers.get('location')!)
    expect(`${target.pathname}${target.search}`).toBe(location)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(release.servingRelease).not.toHaveBeenCalled()
  })

  it.each([
    '/man/tar/1?distro=ubuntu&pkg=tar&portability=text&flag=-x&lang=pt-BR',
    '/man/tar/1?flag=--extract',
    '/man/tar/1?distro=debian',
    '/man/tar?distro=ubuntu&pkg=tar',
    '/man/tar/1.txt?distro=ubuntu',
  ])('keys a canonical %s on the release with exactly its own parameters', async (path) => {
    const response = await proxy(new NextRequest(`https://betterman.sh${path}`))
    expect(response.status).toBe(200)
    const target = new URL(response.headers.get('x-middleware-rewrite')!)
    const expected = new URL(`https://betterman.sh${path}`).searchParams
    expect([...target.searchParams.keys()].sort()).toEqual([...expected.keys(), '__bm_release'].sort())
  })

  it.each(['/man/tar/1?zz=1', '/man/tar/1.txt?zz=1'])('normalizes %s whatever the headers: a client (RSC) header is no way around it', async (path) => {
    const response = await proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { rsc: '1', 'next-router-prefetch': '1' } }))
    expect(response.status).toBe(308)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('passes a canonical share image query', async () => {
    expect((await proxy(new NextRequest('https://betterman.sh/man/tar/1/og?distro=ubuntu&flag=-x'))).status).toBe(200)
  })

  it('passes a real client fetch, whose `_rsc` Next has already removed', async () => {
    const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1?distro=ubuntu', { headers: { rsc: '1' } }))
    expect(response.status).toBe(200)
  })
})

// The UI language is the URL's `?lang=` alone (docs/i18n.md). A remembered choice only redirects a bare URL, privately.
const withCookie = (cookie: string, headers: Record<string, string> = {}) => ({ headers: { cookie, accept: 'text/html', ...headers } })

it.each([
  ['/man/tar/1', 'de', '/man/tar/1?lang=de'],
  ['/man/tar', 'pt-BR', '/man/tar?lang=pt-BR'],
  ['/man/tar/1?pkg=tar', 'ja', '/man/tar/1?pkg=tar&lang=ja'],
])('sends a bare %s with a remembered %s to its explicit ?lang= URL, privately', async (path, lang, location) => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`, withCookie(`bm-lang=${lang}`)))
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get('location')!)
  expect(`${target.pathname}${target.search}`).toBe(location)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(release.servingRelease).not.toHaveBeenCalled()
})

it('sends a reader with both a distro and a language to one URL carrying both', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1', withCookie('bm-distro=ubuntu; bm-lang=fr')))
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get('location')!)
  expect(`${target.pathname}${target.search}`).toBe('/man/tar/1?distro=ubuntu&lang=fr')
})

it('renders an explicit language, including English, without a redirect and without depending on the cookie', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  for (const url of ['/man/tar/1?lang=de', '/man/tar/1?lang=pt-BR']) {
    const response = await proxy(new NextRequest(`https://betterman.sh${url}`, withCookie('bm-lang=fr')))
    expect(response.status, url).toBe(200)
    expect(response.headers.get('x-middleware-rewrite'), url).toContain('__bm_release=')
    expect(response.headers.get('set-cookie')).toBeNull()
  }
  // English is the bare URL on a man page: the allowlist drops `?lang=en` (lib/manQuery.ts), and /-/lang/en remembers English.
  expect((await proxy(new NextRequest('https://betterman.sh/man/tar/1?lang=en', withCookie('bm-lang=fr')))).headers.get('location')).toBe('https://betterman.sh/man/tar/1')
  // A value that is no language is not an explicit choice: the allowlist drops it and the remembered one applies.
  const junk = await proxy(new NextRequest('https://betterman.sh/man/tar/1?lang=nonsense', withCookie('bm-lang=fr')))
  expect(junk.status).toBe(308)
  expect(new URL(junk.headers.get('location')!).search).toBe('')
  // The key keeps the language, so each language is its own cached page.
  const rewrite = new URL((await proxy(new NextRequest('https://betterman.sh/man/tar/1?lang=de'))).headers.get('x-middleware-rewrite')!)
  expect(rewrite.searchParams.get('lang')).toBe('de')
})

it('ignores a remembered language that is not public yet, so nothing renders or redirects for it', async () => {
  holdBack('de', 'ru')
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const gated = await proxy(new NextRequest('https://betterman.sh/man/tar/1', withCookie('bm-lang=ru')))
  expect(gated.status).toBe(200)
  const previewed = await proxy(new NextRequest('https://betterman.sh/man/tar/1', withCookie('bm-lang=de')))
  expect(previewed.status).toBe(307)
  vi.stubEnv('BM_I18N_PREVIEW', '')
  const none = await proxy(new NextRequest('https://betterman.sh/man/tar/1', withCookie('bm-lang=de')))
  expect(none.status).toBe(200)
  const page = await proxy(new NextRequest('https://betterman.sh/search?q=tar', withCookie('bm-lang=de')))
  expect(page.status).toBe(200)
})

it('leaves the plain-text export untranslated', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1.txt', withCookie('bm-lang=de')))
  expect(response.status).toBe(200)
})

it.each([
  ['/', '/?lang=de'],
  ['/search?q=tar', '/search?q=tar&lang=de'],
  ['/section/1?from=t', '/section/1?from=t&lang=de'],
  ['/explain?cmd=tar%20-x', '/explain?cmd=tar+-x&lang=de'],
  ['/no/such/page', '/no/such/page?lang=de'],
])('sends a bare document load of %s to its explicit URL for a reader who remembers a language', async (path, location) => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`, withCookie('bm-lang=de')))
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get('location')!)
  expect(`${target.pathname}${target.search}`).toBe(location)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
})

it.each([
  ['/robots.txt', {}],
  ['/opensearch.xml', {}],
  ['/fonts/bm-text/bm-text-roman-latin.woff2', {}],
  ['/search?q=tar', { rsc: '1', accept: 'text/x-component' }],
  ['/search?q=tar', { accept: 'application/json' }],
  ['/search?q=tar&lang=en', {}],
  ['/search?q=tar&lang=ja', {}],
])('does not redirect %s', async (path, headers) => {
  vi.stubEnv('BM_I18N_PREVIEW', 'all')
  const response = await proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { cookie: 'bm-lang=de', ...(path.startsWith('/search') && !('accept' in headers) ? { accept: 'text/html' } : {}), ...headers } }))
  expect(response.status).toBe(200)
})

it('hands the renderer the URL’s language, and drops one a client sent', async () => {
  holdBack('ru')
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const header = (url: string, extra: Record<string, string> = {}) =>
    proxy(new NextRequest(`https://betterman.sh${url}`, { headers: extra })).then((response) => response.headers.get('x-middleware-request-x-bm-lang'))
  expect(await header('/search?lang=de')).toBe('de')
  expect(await header('/search?lang=en')).toBe('en')
  expect(await header('/search')).toBeNull()
  // A language that is not public renders as English, and a forged header does not make it public.
  expect(await header('/search?lang=ru')).toBeNull()
  expect(await header('/search', { 'x-bm-lang': 'de' })).toBeNull()
  expect(await header('/search?lang=de', { 'x-bm-lang': 'ru' })).toBe('de')
})

it('sets the build’s secret beside the language, and drops one a client sent', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const token = (url: string, extra: Record<string, string> = {}) =>
    proxy(new NextRequest(`https://betterman.sh${url}`, { headers: extra })).then((response) => response.headers.get('x-middleware-request-x-bm-release-token'))
  expect(await token('/search?lang=de')).toBe('test-release-token')
  expect(await token('/search')).toBeNull()
  expect(await token('/search', { 'x-bm-release-token': 'test-release-token' })).toBeNull()
})

it('does not run for a prefetch, so the renderer must not trust the language header there', () => {
  const [app] = (config.matcher as { source: string; missing?: { key: string }[] }[]).filter((entry) => !entry.source.startsWith('/man') && !entry.source.startsWith('/concept') && !entry.source.startsWith('/:name'))
  expect(app.missing?.map((header) => header.key)).toEqual(['next-router-prefetch', 'purpose'])
})

// The switch is two plain links the proxy answers (lib/i18n/switch.ts): no script, no storage.
const link = (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`https://betterman.sh${path}`, { headers: { host: 'betterman.sh', ...headers } }))

it('remembers a language on a private redirect back to the page, in that language', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'de,ja')
  const response = await link('/-/lang/de?to=%2Fman%2Ftar%2F1%3Fdistro%3Dubuntu%26lang%3Dja')
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get('location')!)
  expect(`${target.pathname}${target.search}`).toBe('/man/tar/1?distro=ubuntu&lang=de')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('set-cookie')).toMatch(/^bm-lang=de; Path=\/; Expires=.*SameSite=lax/i)
})

it('returns English to the bare form and remembers it, so a bare URL stays English', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const response = await link('/-/lang/en?to=%2Fsearch%3Fq%3Dtar%26lang%3Dde')
  expect(new URL(response.headers.get('location')!).search).toBe('?q=tar')
  expect(response.headers.get('set-cookie')).toContain('bm-lang=en')
})

it('returns to the page the reader came from when the link names none, and only to this site', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const from = await link('/-/lang/de', { referer: 'https://betterman.sh/section/1?from=t' })
  expect(new URL(from.headers.get('location')!).search).toBe('?from=t&lang=de')
  for (const bad of [{ referer: 'https://evil.example/x' }, {}, { referer: 'https://betterman.sh/-/lang/fr' }] as Array<Record<string, string>>) {
    const response = await link('/-/lang/de', bad)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/')
  }
  for (const to of ['//evil.example', 'https://evil.example', '/\\evil']) {
    const response = await link(`/-/lang/de?to=${encodeURIComponent(to)}`)
    expect(new URL(response.headers.get('location')!).host).toBe('betterman.sh')
  }
})

it('sets no cookie for a language that is not public or not a language', async () => {
  holdBack('ru')
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  for (const code of ['ru', 'xx', '%E0%A4%A']) {
    const response = await link(`/-/lang/${code}?to=%2F`)
    expect(response.status).toBe(307)
    expect(response.headers.get('set-cookie')).toBeNull()
  }
})

it('opens the prefilled translation-fix issue for the page, and never for English', async () => {
  vi.stubEnv('BM_I18N_PREVIEW', 'de')
  const response = await link('/-/fix/de?to=%2Fman%2Ftar%2F1%3Flang%3Dde')
  expect(response.status).toBe(307)
  const issue = new URL(response.headers.get('location')!)
  expect(`${issue.origin}${issue.pathname}`).toBe('https://github.com/amanthanvi/BetterMan/issues/new')
  expect(issue.searchParams.get('locale')).toBe('de')
  expect(issue.searchParams.get('page')).toBe('/man/tar/1?lang=de')
  const english = await link('/-/fix/en?to=%2F')
  expect(new URL(english.headers.get('location')!).host).toBe('betterman.sh')
})

it('sends a man page’s other-case language to the canonical code, not to English', async () => {
  for (const [from, to] of [['DE', 'de'], ['pt-br', 'pt-BR']]) {
    const response = await proxy(new NextRequest(`https://betterman.sh/man/tar/1?lang=${from}`))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(`https://betterman.sh/man/tar/1?lang=${to}`)
  }
})

it('marks the language cookie Secure over HTTPS, and leaves plain-http localhost able to keep it', async () => {
  const cookie = async (url: string, headers: Record<string, string> = {}) =>
    (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, ...headers } }))).headers.get('set-cookie') ?? ''
  expect(await cookie('https://betterman.sh/-/lang/de?to=%2F')).toMatch(/bm-lang=de;.*Secure/i)
  expect(await cookie('http://betterman.sh/-/lang/de?to=%2F', { 'x-forwarded-proto': 'https' })).toMatch(/Secure/i)
  expect(await cookie('http://localhost:3000/-/lang/de?to=%2F')).not.toMatch(/Secure/i)
})

it.each(['/man/tar/1', '/concept/signals'])('authorizes the exact analytics bootstrap hash on cached production pages (%s)', async (path) => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js' } }))
  const csp = (await proxy(new NextRequest(`https://betterman.sh${path}`))).headers.get('content-security-policy')!
  const hash = `'sha256-${createHash('sha256').update(ANALYTICS_BOOT_SCRIPT).digest('base64')}'`
  expect(csp).toContain(`script-src 'self' ${bootHash} ${hash};`)
  expect(csp).toContain(`script-src-elem 'self' ${bootHash} ${hash};`)
  expect(csp).toContain("connect-src 'self';")
  expect(csp).not.toMatch(/https?:|nonce|strict-dynamic|unsafe-eval|script-src[^;]*unsafe-inline/)
})
