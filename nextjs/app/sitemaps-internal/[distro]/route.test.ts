import { expect, it, vi } from 'vitest'

const fetchSeoReleases = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api', () => ({ fetchSeoReleases }))
import { GET } from './route'

it.each([0, 1, 10001])('serves sitemap indexes only for a nonempty tier: %s', async pageCount => {
  fetchSeoReleases.mockResolvedValue({ urlsPerFile: 10000, items: [
    { distro: 'debian', datasetReleaseId: 'fixture', ingestedAt: '', pageCount },
  ] })
  const response = await GET(new Request('https://betterman.test/sitemap-debian.xml'), {
    params: Promise.resolve({ distro: 'debian' }),
  })
  expect(response.status).toBe(pageCount === 0 ? 404 : 200)
  const xml = await response.text()
  expect(xml.includes('/sitemap-debian-1.xml')).toBe(pageCount > 0)
  expect(xml.includes('/sitemap-debian-2.xml')).toBe(pageCount > 10000)
})
