import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const apiMocks = vi.hoisted(() => ({
  FastApiError: class FastApiError extends Error {
    status: number
    bodyText?: string

    constructor(status: number, bodyText?: string) {
      super(`HTTP ${status}`)
      this.status = status
      this.bodyText = bodyText
    }
  },
  fetchManMetaByNameAndSection: vi.fn(),
  search: vi.fn(),
}))

const convexMocks = vi.hoisted(() => ({
  mutation: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  FastApiError: apiMocks.FastApiError,
  fetchInfo: vi.fn(),
  fetchLicenseText: vi.fn(),
  fetchLicenses: vi.fn(),
  fetchManByName: vi.fn(),
  fetchManByNameAndSection: vi.fn(),
  fetchManMetaByNameAndSection: apiMocks.fetchManMetaByNameAndSection,
  fetchRelated: vi.fn(),
  fetchSeoReleases: vi.fn(),
  fetchSeoSitemapPage: vi.fn(),
  listSection: vi.fn(),
  listSections: vi.fn(),
  search: apiMocks.search,
  suggest: vi.fn(),
}))

vi.mock('@/lib/convexClient', () => ({
  getConvexClient: () => convexMocks,
}))

import { GET } from './route'

function request(path: string): NextRequest {
  return new NextRequest(`https://betterman.test${path}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  })
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  convexMocks.mutation.mockResolvedValue({ allowed: true })
})

describe('public API timing and metadata', () => {
  it('serves metadata without loading full page content', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({
      page: {
        id: 'page-1',
        locale: 'en',
        distro: 'debian',
        name: 'bash',
        section: '1',
        title: 'GNU Bourne Again SHell',
        description: 'command language interpreter',
        sourcePackage: 'bash',
        sourcePackageVersion: '5.2',
        datasetReleaseId: 'debian:test',
      },
    })

    const response = await GET(
      request('/api/v1/man/bash/1/meta'),
      context(['v1', 'man', 'bash', '1', 'meta']),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ page: { name: 'bash', section: '1' } })
    expect(apiMocks.fetchManMetaByNameAndSection).toHaveBeenCalledWith({
      distro: 'debian',
      name: 'bash',
      section: '1',
    })
    expect(response.headers.get('Server-Timing')).toMatch(/rate_limit;dur=\d+\.\d, convex_man_meta;dur=\d+\.\d, total;dur=\d+\.\d/)
  })

  it('reports rate-limit, Convex search, and total timing', async () => {
    apiMocks.search.mockResolvedValue({
      query: 'tar',
      results: [],
      suggestions: [],
      hasMore: false,
      nextOffset: null,
    })

    const response = await GET(request('/api/v1/search?q=tar'), context(['v1', 'search']))

    expect(response.status).toBe(200)
    expect(response.headers.get('Server-Timing')).toMatch(/rate_limit;dur=\d+\.\d, convex_search;dur=\d+\.\d, total;dur=\d+\.\d/)
  })

  it('preserves metadata not-found responses with timing', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockRejectedValueOnce(
      new apiMocks.FastApiError(
        404,
        JSON.stringify({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found' } }),
      ),
    )

    const response = await GET(
      request('/api/v1/man/missing/1/meta'),
      context(['v1', 'man', 'missing', '1', 'meta']),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PAGE_NOT_FOUND' } })
    expect(response.headers.get('Server-Timing')).toMatch(/convex_man_meta;dur=\d+\.\d, total;dur=\d+\.\d/)
  })

  it('reports rate-limit timing without calling search when blocked', async () => {
    convexMocks.mutation.mockResolvedValueOnce({ allowed: false })

    const response = await GET(request('/api/v1/search?q=tar'), context(['v1', 'search']))

    expect(response.status).toBe(429)
    expect(apiMocks.search).not.toHaveBeenCalled()
    expect(response.headers.get('Server-Timing')).toMatch(/rate_limit;dur=\d+\.\d, total;dur=\d+\.\d/)
    expect(response.headers.get('Server-Timing')).not.toContain('convex_search')
  })
})

describe('public API property checks', () => {
  it('preserves arbitrary bounded search text as literal input', async () => {
    apiMocks.search.mockResolvedValue({
      query: '',
      results: [],
      suggestions: [],
      hasMore: false,
      nextOffset: null,
    })

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 120 }).filter((value) => value.trim().length > 0),
        async (query) => {
          const params = new URLSearchParams({ q: query })
          const response = await GET(
            request(`/api/v1/search?${params.toString()}`),
            context(['v1', 'search']),
          )

          expect(response.status).toBe(200)
          expect(apiMocks.search).toHaveBeenLastCalledWith({
            distro: 'debian',
            q: query.trim(),
            section: undefined,
            limit: 20,
            offset: 0,
          })
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects non-decimal pagination values without querying Convex', async () => {
    const invalidInteger = fc
      .string({ minLength: 1, maxLength: 32 })
      .filter((value) => value.trim().length > 0 && !/^\d+$/.test(value.trim()))

    await fc.assert(
      fc.asyncProperty(fc.constantFrom('limit', 'offset'), invalidInteger, async (name, value) => {
        const params = new URLSearchParams({ q: 'tar', [name]: value })
        const response = await GET(
          request(`/api/v1/search?${params.toString()}`),
          context(['v1', 'search']),
        )

        expect(response.status).toBe(422)
      }),
      { numRuns: 100 },
    )

    expect(apiMocks.search).not.toHaveBeenCalled()
  })
})
