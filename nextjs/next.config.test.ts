import { expect, it } from 'vitest'
import nextConfig from './next.config'

it('rewrites the fixed first-party tracker paths before page matching', async () => {
  const rewrites = await nextConfig.rewrites!()
  expect(rewrites).toHaveProperty('beforeFiles', expect.arrayContaining([
    { source: '/assets/site.js', destination: '/api/measurement/script' },
    { source: '/assets/entry', destination: '/api/measurement/event' },
  ]))
})
