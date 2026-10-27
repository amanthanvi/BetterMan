import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { afterEach, expect, it, vi } from 'vitest'

import { config, proxy } from './proxy'

afterEach(() => vi.unstubAllEnvs())

it('keeps production CSP self-only for analytics and issues a fresh nonce per request', () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', 'betterman.sh')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
  const first = proxy(new NextRequest('https://betterman.sh/'))
  const second = proxy(new NextRequest('https://betterman.sh/'))
  const csp = first.headers.get('content-security-policy')!
  expect(csp).toContain("connect-src 'self';")
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(csp).toMatch(/script-src-elem 'self' 'nonce-[^']+';/)
  expect(csp).not.toMatch(/plausible\.io|unsafe-eval|script-src[^;]*unsafe-inline/)
  expect(second.headers.get('content-security-policy')).not.toBe(csp)
  expect(csp).toContain(`'nonce-${first.headers.get('x-middleware-request-x-nonce')}'`)
  expect(first.headers.get('x-content-type-options')).toBe('nosniff')
})

it.each(['/api', '/api/v1/info', '/api/v1/man/tar/1', '/assets', '/assets/site.js', '/assets/entry'])('skips API and asset routes: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
})

it.each(['/', '/apiary', '/api-docs', '/assets-guide', '/man/api/3', '/tar', '/tar.1', '/2/open', '/tar/-x', '/opensearch.xml'])('sets CSP on pages: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
})
