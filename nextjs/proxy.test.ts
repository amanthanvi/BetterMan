import { createHash } from 'node:crypto'

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const release = vi.hoisted(() => ({ servingRelease: vi.fn() }))
vi.mock('./lib/manRelease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/manRelease')>()),
  servingRelease: release.servingRelease,
}))

import { MAN_BOOT_SCRIPT } from './lib/manBoot'

process.env.BM_RELEASE_TOKEN = 'test-release-token'
import { config, isManHtmlPath, proxy } from './proxy'

const bootHash = `'sha256-${createHash('sha256').update(MAN_BOOT_SCRIPT).digest('base64')}'`
const releaseFor = (distro: string) => ({ datasetReleaseId: `2026-10-28+${distro}`, distro, pageCount: 10, lastUpdated: '2026-10-28T00:00:00Z' })

beforeEach(() => {
  release.servingRelease.mockReset()
  release.servingRelease.mockImplementation(async (distro: string) => releaseFor(distro))
})
afterEach(() => vi.unstubAllEnvs())

it('keeps production CSP self-only for analytics and issues a fresh nonce per request', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', 'betterman.sh')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
  const first = await proxy(new NextRequest('https://betterman.sh/'))
  const second = await proxy(new NextRequest('https://betterman.sh/'))
  const csp = first.headers.get('content-security-policy')!
  expect(csp).toContain("connect-src 'self';")
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(csp).toMatch(/script-src-elem 'self' 'nonce-[^']+';/)
  expect(csp).not.toMatch(/plausible\.io|unsafe-eval|script-src[^;]*unsafe-inline/)
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
  const response = await proxy(new NextRequest('https://betterman.sh/man/tar/1?__bm_release=forged', { headers: { 'x-bm-release': JSON.stringify(releaseFor('debian')) } }))
  expect(new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('__bm_release')).toBe('unknown')
  expect(response.headers.get('x-middleware-request-x-bm-release')).toBeNull()
  expect(response.headers.get('x-middleware-request-x-bm-release-token')).toBeNull()
})

it.each([
  ['/man/tar/1', 'ubuntu', '/man/tar/1?distro=ubuntu'],
  ['/man/tar', 'macos', '/man/tar?distro=macos'],
  ['/man/tar/1?distro=nonsense&pkg=tar', 'fedora', '/man/tar/1?distro=fedora&pkg=tar'],
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

it.each(['/api', '/api/v1/info', '/api/v1/man/tar/1', '/assets', '/assets/site.js', '/assets/entry', '/_bm/man.0123456789abcdef.js'])('skips API and asset routes: %s', (url) => {
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
  const response = await proxy(new NextRequest(`https://betterman.sh${path}?__bm_release=forged`))
  expect(new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('__bm_release')).toBe('2026-10-28+debian')
})
