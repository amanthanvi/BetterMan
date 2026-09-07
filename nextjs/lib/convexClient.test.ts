import { afterEach, expect, it, vi } from 'vitest'
import { getConvexUrl } from './convexClient'

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
