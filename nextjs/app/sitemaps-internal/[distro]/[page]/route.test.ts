import { describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  fetchSeoReleases: vi.fn(),
  fetchSeoSitemapPage: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  FastApiError: class FastApiError extends Error {},
  fetchSeoReleases: apiMocks.fetchSeoReleases,
  fetchSeoSitemapPage: apiMocks.fetchSeoSitemapPage,
}))

import { GET } from './route'

function get(ifNoneMatch?: string) {
  const request = new Request('https://betterman.test/sitemap-debian-1.xml', {
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
  })
  return GET(request, { params: Promise.resolve({ distro: 'debian', page: '1' }) })
}

describe('sitemap page ETag', () => {
  it('describes the release whose URLs were served', async () => {
    apiMocks.fetchSeoReleases.mockResolvedValue({
      urlsPerFile: 10000,
      items: [{ distro: 'debian', datasetReleaseId: 'listed', ingestedAt: '', pageCount: 1 }],
    })
    apiMocks.fetchSeoSitemapPage.mockResolvedValue({ datasetReleaseId: 'listed', items: [{ name: 'ls', section: '1' }], page: 1 })
    const listedEtag = (await get()).headers.get('etag')
    expect((await get(listedEtag!)).status).toBe(304)

    apiMocks.fetchSeoSitemapPage.mockResolvedValue({ datasetReleaseId: 'other', items: [{ name: 'ls', section: '1' }], page: 1 })
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).not.toBe(listedEtag)
  })
})
