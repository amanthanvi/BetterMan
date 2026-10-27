import { expect, it } from 'vitest'
import nextConfig from './next.config'

it('rewrites the fixed first-party tracker paths before page matching', async () => {
  const rewrites = await nextConfig.rewrites!()
  expect(rewrites).toHaveProperty('beforeFiles', expect.arrayContaining([
    { source: '/assets/entry', destination: '/api/measurement/event' },
  ]))
  expect(JSON.stringify(rewrites)).not.toContain('/assets/site.js')
})

it('sets non-HTML security headers without invoking middleware for analytics assets', async () => {
  expect(await nextConfig.headers!()).toEqual(expect.arrayContaining([
    { source: '/assets/:path*', headers: expect.arrayContaining([
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ]) },
  ]))
})
