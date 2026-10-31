import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A) => await fn(...args),
}))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))

import { fetchTranslationSitemap } from './api'

// A German release of 2,101 pages: sitemap pages of 1,000, 1,000 and 101 (#395).
const PAGES = 2101
const onPage = (page: number) => Array.from({ length: PAGES }, (_, i) => i).filter((i) => Math.floor(i / 1000) + 1 === page)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockImplementation(async (_fn: unknown, args: { page?: number; paginationOpts?: { numItems: number; cursor: string | null } }) => {
    if (!args.paginationOpts) {
      return { items: [{ distro: 'debian', locale: 'de', datasetReleaseId: 'de1', ingestedAt: '', pageCount: PAGES, sitemapPages: 3 }] }
    }
    const rows = onPage(args.page!)
    const start = Number(args.paginationOpts.cursor ?? 0)
    const end = Math.min(rows.length, start + args.paginationOpts.numItems)
    return {
      datasetReleaseId: 'de1',
      items: rows.slice(start, end).map((i) => ({ name: `p${i}`, section: '1', locales: ['de'] })),
      isDone: end >= rows.length,
      continueCursor: String(end),
    }
  })
})

it('reads every translated page across sitemap pages, each within the chunk cap', async () => {
  const files = await Promise.all([1, 2, 3].map((page) => fetchTranslationSitemap({ distro: 'debian', lang: 'de', page })))
  expect(files.map((file) => file.items.length)).toEqual([1000, 1000, 101])
  expect(files.flatMap((file) => file.items).length).toBe(PAGES)
  // Five 200-item chunks for a full file, never the 10-chunk cap.
  const chunkCalls = mocks.query.mock.calls.filter(([, args]) => (args as { page?: number }).page === 1)
  expect(chunkCalls).toHaveLength(5)
})

it('answers 404 past the last sitemap page', async () => {
  await expect(fetchTranslationSitemap({ distro: 'debian', lang: 'de', page: 4 })).rejects.toMatchObject({ status: 404 })
  await expect(fetchTranslationSitemap({ distro: 'debian', lang: 'fr', page: 1 })).rejects.toMatchObject({ status: 404 })
})
