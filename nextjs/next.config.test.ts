import { expect, it } from 'vitest'
import { nextConfig } from './next.config'

it('sets non-HTML security headers without invoking middleware for static assets', async () => {
  expect(await nextConfig.headers!()).toEqual(expect.arrayContaining([
    { source: '/assets/:path*', headers: expect.arrayContaining([
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ]) },
  ]))
})
