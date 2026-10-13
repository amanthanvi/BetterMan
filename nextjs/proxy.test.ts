import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { afterEach, expect, it, vi } from 'vitest'

import { config, proxy } from './proxy'

afterEach(() => vi.unstubAllEnvs())

it.each([
  '/robots.txt', '/opensearch.xml', '/sitemap.xml', '/sitemap-debian.xml',
  '/sitemap-debian-1.xml', '/sitemaps-internal/index', '/sitemaps-internal/debian/1',
  '/opengraph-image', '/opengraph-image?abc123',
])('keeps cached metadata free of a per-request CSP nonce: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
})

it.each([
  '/', '/man/tar/1', '/search?q=tar', '/section/1', '/licenses',
  '/robots.txt/extra', '/sitemap.xml/extra', '/sitemaps-internal-other',
  '/apiary', '/opengraph-image-other', '/sitemaps-internal',
  '/sitemaps-internal/debian/1/extra',
])('continues protecting HTML paths: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
})

it('generates fresh matching request/response nonces without production unsafe-inline', () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('CSP_ENABLED', 'true')
  const first = proxy(new NextRequest('https://betterman.sh/man/tar/1'))
  const second = proxy(new NextRequest('https://betterman.sh/man/tar/1'))
  const csp = first.headers.get('content-security-policy')!
  const nonce = first.headers.get('x-middleware-request-x-nonce')!
  expect(nonce).toBeTruthy()
  expect(csp).toContain(`'nonce-${nonce}'`)
  expect(csp).toContain("script-src-elem 'self' 'nonce-")
  expect(csp.split('; ').find((directive) => directive.startsWith('script-src '))).not.toContain('unsafe-inline')
  expect(csp).not.toContain('unsafe-eval')
  expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp)
  expect(second.headers.get('x-middleware-request-x-nonce')).not.toBe(nonce)
})
