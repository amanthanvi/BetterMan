import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SeoReleasesResponse } from '../../lib/api'

const mocks = vi.hoisted(() => ({ releases: vi.fn(), page: vi.fn() }))
vi.mock('../../lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/api')>(),
  fetchSeoReleases: mocks.releases,
  fetchSeoSitemapPage: mocks.page,
}))

import { FastApiError } from '../../lib/api'
import { GET as index } from './[distro]/route'
import { GET as sitemapPage } from './[distro]/[page]/route'
import { GET as robots } from '../robots.txt/route'

const releases: SeoReleasesResponse = {
  urlsPerFile: 2,
  items: [
    { distro: 'ubuntu', datasetReleaseId: 'u1', ingestedAt: 'invalid', pageCount: 1 },
    { distro: 'debian', datasetReleaseId: 'd1', ingestedAt: '2026-10-01T05:00:00.000Z', pageCount: 3 },
  ],
}

function request(etag?: string): Request {
  return new Request('https://attacker.example/sitemap.xml?distro=ubuntu', {
    headers: {
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
      cookie: 'bm-distro=ubuntu; bm-theme-resolved=dark',
      ...(etag ? { 'if-none-match': etag } : {}),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
  mocks.releases.mockResolvedValue(structuredClone(releases))
  mocks.page.mockResolvedValue({ items: [{ name: 'a&b', section: '1' }], page: 1 })
})

afterEach(() => vi.unstubAllEnvs())

describe('cacheable sitemap responses', () => {
  it('renders the public release index in canonical sorted order regardless of request/cookies', async () => {
    const response = await index(request(), { params: Promise.resolve({ distro: 'index' }) })
    const xml = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600')
    expect(response.headers.get('content-type')).toContain('application/xml')
    expect(xml).toContain('https://betterman.sh/sitemap-debian.xml')
    expect(xml.indexOf('sitemap-debian')).toBeLessThan(xml.indexOf('sitemap-ubuntu'))
    expect(xml).toContain('<lastmod>2026-10-01T05:00:00Z</lastmod>')
    expect(xml).not.toContain('attacker.example')
    expect(xml).not.toContain('invalid')
  })

  it('renders every distro chunk including the final partial chunk', async () => {
    const response = await index(request(), { params: Promise.resolve({ distro: 'debian' }) })
    const xml = await response.text()
    expect(xml).toContain('https://betterman.sh/sitemap-debian-1.xml')
    expect(xml).toContain('https://betterman.sh/sitemap-debian-2.xml')
    expect(xml).not.toContain('sitemap-debian-3.xml')
  })

  it('encodes man names and includes non-default distro variants in page XML', async () => {
    const response = await sitemapPage(request(), { params: Promise.resolve({ distro: 'ubuntu', page: '1' }) })
    expect(await response.text()).toContain('https://betterman.sh/man/a%26b/1?distro=ubuntu')
    expect(mocks.page).toHaveBeenCalledWith({ distro: 'ubuntu', page: 1 })
  })

  it('ignores inbound validators so a crawler cannot persist an empty 304 as ISR output', async () => {
    const params = { params: Promise.resolve({ distro: 'index' }) }
    const first = await index(request(), params)
    const etag = first.headers.get('etag')!
    const second = await index(request(etag), params)
    expect(second.status).toBe(200)
    expect(await second.text()).toEqual(await first.text())
    expect(second.headers.get('etag')).toBe(etag)
  })

  it('changes the validator whenever lastmod or the canonical origin changes', async () => {
    const params = { params: Promise.resolve({ distro: 'debian' }) }
    const first = await index(request(), params)
    const changed = structuredClone(releases)
    changed.items[1].ingestedAt = '2026-10-02T05:00:00Z'
    mocks.releases.mockResolvedValue(changed)
    const second = await index(request(), params)
    expect(second.headers.get('etag')).not.toBe(first.headers.get('etag'))
    vi.stubEnv('PUBLIC_BASE_URL', 'https://preview.example')
    const third = await index(request(), params)
    expect(third.headers.get('etag')).not.toBe(second.headers.get('etag'))
    expect(await third.text()).toContain('https://preview.example/')
  })

  it.each(['0', '-1', '1.5', 'NaN', '3'])('rejects invalid or out-of-range chunk %s without reading page data', async (page) => {
    const response = await sitemapPage(request(), { params: Promise.resolve({ distro: 'debian', page }) })
    expect(response.status).toBe(404)
    expect(mocks.page).not.toHaveBeenCalled()
  })

  it('returns 404 for an unavailable distro, but propagates backend failures', async () => {
    const params = { params: Promise.resolve({ distro: 'fedora' }) }
    expect((await index(request(), params)).status).toBe(404)
    mocks.releases.mockRejectedValue(new Error('backend unavailable'))
    await expect(index(request(), params)).rejects.toThrow('backend unavailable')
  })

  it('distinguishes a missing sitemap page from a backend outage', async () => {
    const params = { params: Promise.resolve({ distro: 'debian', page: '1' }) }
    mocks.page.mockRejectedValue(new FastApiError(404, 'SITEMAP_PAGE_NOT_FOUND', 'missing'))
    expect((await sitemapPage(request(), params)).status).toBe(404)
    mocks.page.mockRejectedValue(new Error('backend unavailable'))
    await expect(sitemapPage(request(), params)).rejects.toThrow('backend unavailable')
  })

  it('falls back to the canonical origin when unconfigured, never request headers', async () => {
    vi.stubEnv('PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    // The request points at a hostile host; static routes must not trust it.
    const response = await index(request(), { params: Promise.resolve({ distro: 'index' }) })
    const text = await response.text()
    expect(text).toContain('https://betterman.sh/sitemap-debian.xml')
    expect(text).not.toContain('attacker.example')
  })
})

it('prerendered robots preserves bot rules and the canonical sitemap URL', async () => {
  const response = await robots()
  const body = await response.text()
  expect(body).toContain('User-agent: GPTBot\nDisallow: /')
  expect(body).toContain('User-agent: *\nAllow: /\nDisallow: /api/')
  expect(body).toContain('Sitemap: https://betterman.sh/sitemap.xml')
  expect(response.headers.get('cache-control')).toContain('s-maxage=3600')
})
