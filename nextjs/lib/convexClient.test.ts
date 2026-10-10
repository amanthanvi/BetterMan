import { afterEach, expect, it, vi } from 'vitest'
import { getConvexSiteUrl, getConvexUrl } from './convexClient'

afterEach(() => vi.unstubAllEnvs())

it('prefers explicit application URLs over test-tooling local URLs', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', ' https://public.convex.cloud ')
  vi.stubEnv('CONVEX_URL', 'https://server.convex.cloud')
  vi.stubEnv('VITE_CONVEX_URL', 'http://127.0.0.1:3210')
  expect(getConvexUrl()).toBe('https://public.convex.cloud')
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '')
  expect(getConvexUrl()).toBe('https://server.convex.cloud')
})

it('accepts the local URL generated when Convex detects Vite test tooling', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '')
  vi.stubEnv('CONVEX_URL', '')
  vi.stubEnv('VITE_CONVEX_URL', ' http://127.0.0.1:3210 ')
  expect(getConvexUrl()).toBe('http://127.0.0.1:3210')
  vi.stubEnv('VITE_CONVEX_URL', '')
  expect(() => getConvexUrl()).toThrow('is required')
})

it('resolves the HTTP actions URL from an explicit value or the cloud deployment', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://happy-otter-123.convex.cloud/')
  vi.stubEnv('CONVEX_SITE_URL', ' https://custom.example/convex ')
  expect(getConvexSiteUrl()).toBe('https://custom.example/convex')
  vi.stubEnv('CONVEX_SITE_URL', '')
  expect(getConvexSiteUrl()).toBe('https://happy-otter-123.convex.site')
})

it('uses the generated local site URL for a local deployment', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '')
  vi.stubEnv('CONVEX_URL', '')
  vi.stubEnv('CONVEX_SITE_URL', '')
  vi.stubEnv('VITE_CONVEX_URL', 'http://127.0.0.1:3210')
  vi.stubEnv('VITE_CONVEX_SITE_URL', 'http://127.0.0.1:3211')
  expect(getConvexSiteUrl()).toBe('http://127.0.0.1:3211')
  vi.stubEnv('VITE_CONVEX_SITE_URL', '')
  expect(() => getConvexSiteUrl()).toThrow('CONVEX_SITE_URL is required')
})
