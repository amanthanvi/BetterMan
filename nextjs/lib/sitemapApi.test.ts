import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), stored: [] as unknown[] }))
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[]) =>
    async (...args: A) => {
      const value = await fn(...args)
      if (keyParts.includes('seo-sitemap-page')) mocks.stored.push(value)
      return value
    },
}))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))

import { fetchSeoSitemapPage } from './api'

function serve(listed: string, active: string) {
  mocks.query.mockImplementation(async (_fn: unknown, args: { paginationOpts?: unknown }) =>
    args.paginationOpts
      ? { datasetReleaseId: active, items: [{ name: 'ls', section: '1' }], page: 1, isDone: true, continueCursor: '' }
      : { urlsPerFile: 10000, items: [{ distro: 'debian', datasetReleaseId: listed, ingestedAt: '', pageCount: 1 }] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stored.length = 0
})

it('caches a sitemap page under the release it read', async () => {
  serve('current', 'current')
  await expect(fetchSeoSitemapPage({ distro: 'debian', page: 1 })).resolves.toMatchObject({ datasetReleaseId: 'current' })
  expect(mocks.stored).toHaveLength(1)
})

it('serves the active release uncached when the listed release is stale or pruned', async () => {
  serve('pruned', 'current')
  await expect(fetchSeoSitemapPage({ distro: 'debian', page: 1 })).resolves.toMatchObject({
    datasetReleaseId: 'current',
    items: [{ name: 'ls', section: '1' }],
  })
  expect(mocks.stored).toHaveLength(0)
})
