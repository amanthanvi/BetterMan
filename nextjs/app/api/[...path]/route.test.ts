import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type * as Api from '@/lib/api'

const apiMocks = vi.hoisted(() => ({
  fetchManByNameAndSectionOrAlias: vi.fn(),
  fetchManDistros: vi.fn(),
  fetchManMetaByNameAndSection: vi.fn(),
  search: vi.fn(),
  listSection: vi.fn(),
  suggest: vi.fn(),
}))

const convexMocks = vi.hoisted(() => ({
  mutation: vi.fn(),
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof Api>('@/lib/api')
  return {
    // Same class the real withDistroFallback checks with instanceof.
    FastApiError: actual.FastApiError,
    fetchInfo: vi.fn(),
    fetchLicenseText: vi.fn(),
    fetchLicenses: vi.fn(),
    fetchManByName: vi.fn(),
    fetchManByNameAndSectionOrAlias: apiMocks.fetchManByNameAndSectionOrAlias,
    fetchManDistros: apiMocks.fetchManDistros,
    fetchManMetaByNameAndSection: apiMocks.fetchManMetaByNameAndSection,
    fetchRelated: vi.fn(),
    fetchSeoReleases: vi.fn(),
    fetchSeoSitemapPage: vi.fn(),
    listSection: apiMocks.listSection,
    listSections: vi.fn(),
    search: apiMocks.search,
    suggest: apiMocks.suggest,
    // Real helper, so the suggest fallback test goes through isReleaseNotFoundError.
    withDistroFallback: actual.withDistroFallback,
  }
})

vi.mock('@/lib/convexClient', () => ({
  getConvexClient: () => convexMocks,
}))

import { FastApiError } from '@/lib/api'
import { GET, HEAD } from './route'

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
  vi.stubEnv('RATE_LIMIT_TAG_KEY', 'route-test-key')
  convexMocks.mutation.mockResolvedValue({ allowed: true })
})

afterEach(() => vi.unstubAllEnvs())

it.each([GET, HEAD])('keeps security headers on rate-limited API reads', async (handler) => {
  vi.stubEnv('NODE_ENV', 'production')
  convexMocks.mutation.mockResolvedValue({ allowed: false })
  const req = request('/api/v1/suggest?q=ta')
  req.headers.set('purpose', 'prefetch')
  const res = await handler(req, context(['v1', 'suggest']))
  expect(res.status).toBe(429)
  expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000')
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  if (handler === HEAD) expect(await res.text()).toBe('')
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
      new FastApiError(
        404,
        'PAGE_NOT_FOUND',
        'Page not found',
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

  it('does not split search or page buckets on spoofable forwarding headers', async () => {
    const spoofed: Record<string, string>[] = [
      { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '8.8.8.8' },
      { 'cf-connecting-ip': '2.2.2.2', 'x-real-ip': '9.9.9.9' },
      { 'x-forwarded-for': '3.3.3.3' },
    ]

    for (const headers of spoofed) {
      convexMocks.mutation.mockClear()
      const searchResponse = await GET(
        new NextRequest('https://betterman.test/api/v1/search?q=tar', { headers }),
        context(['v1', 'search']),
      )
      expect(searchResponse.status).toBe(200)
      expect(convexMocks.mutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'search', identifier: 'anonymous' }),
      )
    }

    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({
      page: { name: 'bash', section: '1', title: 'bash', description: 'shell' },
    })
    for (const headers of spoofed) {
      convexMocks.mutation.mockClear()
      const pageResponse = await GET(
        new NextRequest('https://betterman.test/api/v1/man/bash/1/meta', { headers }),
        context(['v1', 'man', 'bash', '1', 'meta']),
      )
      expect(pageResponse.status).toBe(200)
      expect(convexMocks.mutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'page', identifier: 'anonymous' }),
      )
    }
  })

  it('keys page limits on the Vercel-overwritten client address', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({
      page: { name: 'bash', section: '1', title: 'bash', description: 'shell' },
    })
    const response = await GET(
      new NextRequest('https://betterman.test/api/v1/man/bash/1/meta', {
        headers: { 'x-vercel-forwarded-for': '203.0.113.10, 10.0.0.1', 'cf-connecting-ip': '1.1.1.1' },
      }),
      context(['v1', 'man', 'bash', '1', 'meta']),
    )

    expect(response.status).toBe(200)
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'page', identifier: '203.0.113.10' }),
    )
  })
})

describe('public API aliases', () => {
  it('redirects a .so alias to its target with the distro preserved', async () => {
    apiMocks.fetchManByNameAndSectionOrAlias.mockResolvedValueOnce({ kind: 'alias', name: 'gzip', section: '1' })

    const res = await GET(request('/api/v1/man/gunzip/1?distro=ubuntu'), context(['v1', 'man', 'gunzip', '1']))

    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('/api/v1/man/gzip/1?distro=ubuntu')
  })
})

describe('man page distros API', () => {
  it('lists the distros that have a page, whatever distro the caller is on', async () => {
    apiMocks.fetchManDistros.mockResolvedValueOnce({ distros: ['debian', 'ubuntu'] })

    const res = await GET(request('/api/v1/man/SystemCTL/1/distros?distro=macos'), context(['v1', 'man', 'SystemCTL', '1', 'distros']))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ distros: ['debian', 'ubuntu'] })
    expect(apiMocks.fetchManDistros).toHaveBeenCalledWith({ name: 'systemctl', section: '1' })
  })
})

describe('suggest API', () => {
  const suggestions = [{ name: 'tar', section: '1', description: 'archive' }]

  it('answers for the requested distro and names it', async () => {
    apiMocks.suggest.mockResolvedValueOnce({ query: 'ta', suggestions })

    const res = await GET(request('/api/v1/suggest?name=ta&distro=ubuntu'), context(['v1', 'suggest']))

    expect(apiMocks.suggest).toHaveBeenCalledWith({ distro: 'ubuntu', name: 'ta' })
    await expect(res.json()).resolves.toEqual({ query: 'ta', suggestions, distro: 'ubuntu' })
  })

  it('falls back to Debian when the distro has no active release and says so', async () => {
    apiMocks.suggest
      .mockRejectedValueOnce(
        new FastApiError(
          404,
          'RELEASE_NOT_FOUND',
          'Dataset release not found',
          JSON.stringify({ error: { code: 'RELEASE_NOT_FOUND', message: 'Dataset release not found' } }),
        ),
      )
      .mockResolvedValueOnce({ query: 'ta', suggestions })

    const res = await GET(request('/api/v1/suggest?name=ta&distro=freebsd'), context(['v1', 'suggest']))

    expect(apiMocks.suggest.mock.calls.map(([opts]) => opts.distro)).toEqual(['freebsd', 'debian'])
    await expect(res.json()).resolves.toEqual({ query: 'ta', suggestions, distro: 'debian' })
  })

  it.each(['q=t', 'q=ta', 'name=t'])('answers a short prefix: %s', async (params) => {
    apiMocks.suggest.mockResolvedValueOnce({ query: 't', suggestions })

    const res = await GET(request(`/api/v1/suggest?${params}`), context(['v1', 'suggest']))

    expect(res.status).toBe(200)
    expect(apiMocks.suggest).toHaveBeenCalledWith({ distro: 'debian', name: params.split('=')[1] })
    await expect(res.json()).resolves.toEqual({ query: 't', suggestions, distro: 'debian' })
  })

  it.each(['', 'q=', 'q=%20', `q=${'a'.repeat(201)}`])('rejects a missing or oversized query: %s', async (params) => {
    const res = await GET(request(`/api/v1/suggest?${params}`), context(['v1', 'suggest']))

    expect(res.status).toBe(400)
    expect(apiMocks.suggest).not.toHaveBeenCalled()
  })

  it('answers in the OpenSearch suggestions format, one row per name', async () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
    apiMocks.suggest.mockResolvedValueOnce({
      query: 'ta',
      suggestions: [
        { name: 'tar', section: '1', description: 'an archiving utility' },
        { name: 'tar', section: '5', description: 'format of tape archive files' },
        { name: 'tail', section: '1', description: 'output the last part of files' },
      ],
    })

    const res = await GET(request('/api/v1/suggest?q=Ta&format=opensearch&distro=ubuntu'), context(['v1', 'suggest']))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/x-suggestions+json; charset=utf-8')
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
    await expect(res.json()).resolves.toEqual([
      'Ta',
      ['tar', 'tail'],
      ['an archiving utility', 'output the last part of files'],
      ['https://betterman.sh/man/tar?distro=ubuntu', 'https://betterman.sh/man/tail/1?distro=ubuntu'],
    ])
  })

  it('keeps the rate limit for OpenSearch suggestions', async () => {
    convexMocks.mutation.mockResolvedValueOnce({ allowed: false })

    const res = await GET(request('/api/v1/suggest?q=ta&format=opensearch'), context(['v1', 'suggest']))

    expect(res.status).toBe(429)
    expect(apiMocks.suggest).not.toHaveBeenCalled()
  })

  it('echoes the raw OpenSearch query, trailing space included, and looks up the trimmed name', async () => {
    apiMocks.suggest.mockResolvedValueOnce({ query: 'tar', suggestions })

    const res = await GET(request('/api/v1/suggest?q=tar%20&format=opensearch'), context(['v1', 'suggest']))

    expect(apiMocks.suggest).toHaveBeenCalledWith({ distro: 'debian', name: 'tar' })
    const body = (await res.json()) as unknown[]
    expect(body[0]).toBe('tar ')
  })

  it.each([
    ['/api/v1/suggest?q=ta&format=xml', 422],
    ['/api/v1/suggest?q=ta&distro=plan9', 400],
    ['/api/v1/suggest?q=', 400],
    [`/api/v1/suggest?q=${'a'.repeat(201)}`, 400],
  ])('rejects %s before the rate limit or a lookup', async (path, status) => {
    const res = await GET(request(path), context(['v1', 'suggest']))

    expect(res.status).toBe(status)
    expect(convexMocks.mutation).not.toHaveBeenCalled()
    expect(apiMocks.suggest).not.toHaveBeenCalled()
  })

  it.each(['tar -x', 'how do i extract', 'a/b', '../etc', '-x', '<script>', '%2541'])(
    'answers %j, which cannot be a name, with no suggestions and no Convex call',
    async (q) => {
      const params = new URLSearchParams({ q, format: 'opensearch' })
      const res = await GET(request(`/api/v1/suggest?${params}`), context(['v1', 'suggest']))

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/x-suggestions+json; charset=utf-8')
      expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
      await expect(res.json()).resolves.toEqual([q, []])
      expect(convexMocks.mutation).not.toHaveBeenCalled()
      expect(apiMocks.suggest).not.toHaveBeenCalled()
    },
  )

  it('answers an implausible name in the JSON format the same way', async () => {
    const res = await GET(request('/api/v1/suggest?name=Tar%20-x&distro=ubuntu'), context(['v1', 'suggest']))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ query: 'tar -x', suggestions: [], distro: 'ubuntu' })
    expect(convexMocks.mutation).not.toHaveBeenCalled()
    expect(apiMocks.suggest).not.toHaveBeenCalled()
  })

  it('spends the rate limit before the lookup for a plausible name', async () => {
    apiMocks.suggest.mockResolvedValueOnce({ query: 'ta', suggestions })

    await GET(request('/api/v1/suggest?q=ta'), context(['v1', 'suggest']))

    expect(convexMocks.mutation).toHaveBeenCalledOnce()
    expect(convexMocks.mutation.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.suggest.mock.invocationCallOrder[0])
  })

  it('does not fall back for an error that only carries the missing-release code', async () => {
    const lookalike = Object.assign(new Error('Dataset release not found'), { code: 'RELEASE_NOT_FOUND' })
    apiMocks.suggest.mockRejectedValueOnce(lookalike)

    await expect(GET(request('/api/v1/suggest?name=ta&distro=freebsd'), context(['v1', 'suggest']))).rejects.toBe(
      lookalike,
    )
    expect(apiMocks.suggest.mock.calls.map(([opts]) => opts.distro)).toEqual(['freebsd'])
  })
})

describe('section pagination API', () => {
  it.each(['section', 'sections'])('preserves offset callers at /api/v1/%s/1', async (path) => {
    const result = { section: '1', label: 'User Commands', total: 3, limit: 1, offset: 1,
      results: [{ name: 'bash', section: '1', title: 'bash', description: 'shell' }],
      hasMore: true, nextCursor: 'bash', prevCursor: 'bash' }
    apiMocks.listSection.mockResolvedValue(result)
    const res = await GET(request(`/api/v1/${path}/1?limit=1&offset=1`), context(['v1', path, '1']))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(result)
    expect(apiMocks.listSection).toHaveBeenCalledWith({ distro: 'debian', section: '1', limit: 1, offset: 1 })
  })

  it.each(['cursor', 'before'])('passes literal %s values and deep display offsets', async (name) => {
    apiMocks.listSection.mockResolvedValue({ results: [], hasMore: false, nextCursor: null, prevCursor: null })
    const params = new URLSearchParams({ [name]: 'name+with&symbols', offset: '5500', distro: 'ubuntu' })
    const res = await GET(request(`/api/v1/sections/1?${params}`), context(['v1', 'sections', '1']))
    expect(res.status).toBe(200)
    expect(apiMocks.listSection).toHaveBeenCalledWith({
      distro: 'ubuntu', section: '1', limit: 200, offset: 5500, [name]: 'name+with&symbols',
    })
  })

  it.each(['cursor=awk&before=bash', 'offset=5001', 'cursor=awk&offset=9007199254740992'])('rejects invalid pagination: %s', async (params) => {
    const res = await GET(request(`/api/v1/sections/1?${params}`), context(['v1', 'sections', '1']))
    expect(res.status).toBe(422)
    expect(apiMocks.listSection).not.toHaveBeenCalled()
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
          apiMocks.search.mockClear()
          const params = new URLSearchParams({ q: query })
          const response = await GET(
            request(`/api/v1/search?${params.toString()}`),
            context(['v1', 'search']),
          )

          expect(response.status).toBe(200)
          expect(apiMocks.search).toHaveBeenCalledOnce()
          expect(apiMocks.search).toHaveBeenCalledWith({
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
        apiMocks.search.mockClear()
        const params = new URLSearchParams({ q: 'tar', [name]: value })
        const response = await GET(
          request(`/api/v1/search?${params.toString()}`),
          context(['v1', 'search']),
        )

        expect(response.status).toBe(422)
        await expect(response.json()).resolves.toEqual({
          error: { code: 'INVALID_QUERY_PARAM', message: `Invalid ${name}` },
        })
        expect(apiMocks.search).not.toHaveBeenCalled()
      }),
      { numRuns: 100 },
    )
  })
})
