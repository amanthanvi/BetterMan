import { expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetchSeoReleases: vi.fn() }))
vi.mock('../../lib/api', () => api)
vi.mock('../../lib/concepts', () => ({ approvedConcepts: () => [] }))
import { GET } from './route'

it('keeps translations out of the sitemap', async () => {
  api.fetchSeoReleases.mockResolvedValue({ items: [{ distro: 'debian', datasetReleaseId: 'en1', ingestedAt: '', pageCount: 1 }] })
  const response = await GET(new Request('http://localhost:3000/sitemap.xml'))
  const xml = await response.text()
  expect(xml).toContain('/sitemap-debian.xml')
  expect(xml).not.toContain('translations')
})
