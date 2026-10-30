import { readdirSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { analyticsConfig } from './lib/analyticsConfig'
import { nextConfig } from './next.config'

afterEach(() => vi.unstubAllEnvs())

it('sets non-HTML security headers without invoking middleware for static assets', async () => {
  expect(await nextConfig.headers!()).toEqual(expect.arrayContaining([
    { source: '/assets/:path*', headers: expect.arrayContaining([
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ]) },
  ]))
})

it('keeps test files out of the Pages Router public route tree', () => {
  const files = readdirSync(new URL('./pages/', import.meta.url), { recursive: true, encoding: 'utf8' })
  expect(files.filter((file) => /\.(?:test|spec)\./.test(file))).toEqual([])
})

it.each([
  ['', '{"analytics":{"scriptSrc":"/prefixed/script.js"}}', '/prefixed/script.js'],
  ['{"analytics":{"scriptSrc":"/primary/script.js"}}', '{"analytics":{"scriptSrc":"/prefixed/script.js"}}', '/primary/script.js'],
  ['', '{"analytics":{"scriptSrc":"https://external.invalid/script.js"}}', null],
  ['', '{', null],
])('retains and validates the primary or prefixed build configuration', async (primary, prefixed, expected) => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', primary)
  vi.stubEnv('NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG', prefixed)
  vi.resetModules()
  const { nextConfig: configured } = await import('./next.config')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', configured.env!.VERCEL_OBSERVABILITY_CLIENT_CONFIG!)
  expect(analyticsConfig()?.scriptSrc ?? null).toBe(expected)
})
