import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)

const ogCard = vi.hoisted(() => vi.fn(async () => new Response('png', { status: 200 })))

const isRateLimited = vi.hoisted(() => vi.fn(async () => false))

const apiMocks = vi.hoisted(() => {
  class FastApiError extends Error {
    status: number
    code: string

    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
      this.name = 'FastApiError'
    }
  }

  return {
    FastApiError,
    fetchManMetaByNameAndSection: vi.fn(),
    fetchManByNameAndSectionOrAlias: vi.fn(),
    withDistroFallback: vi.fn(),
  }
})

const servingRelease = vi.hoisted(() => vi.fn(async () => null as null | { datasetReleaseId: string; lastUpdated: string }))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('../../../../../lib/og/card', () => ({ ogCard, OG_SIZE: { width: 1200, height: 630 } }))
vi.mock('../../../../../lib/rateLimit', () => ({ isRateLimited }))
vi.mock('../../../../../lib/api', () => ({
  FastApiError: apiMocks.FastApiError,
  fetchManMetaByNameAndSection: apiMocks.fetchManMetaByNameAndSection,
  fetchManByNameAndSectionOrAlias: apiMocks.fetchManByNameAndSectionOrAlias,
  withDistroFallback: apiMocks.withDistroFallback,
}))
vi.mock('../../../../../lib/manRelease', () => ({ servingRelease }))
vi.mock('../../../../../components/man/RunningHead', () => ({ sectionLabel: (section: string) => `Section ${section}` }))

import { GET } from './route'

function get(name: string, section: string, search = '') {
  const request = new Request(`https://betterman.sh/man/${encodeURIComponent(name)}/${section}/og${search}`)
  return GET(request, { params: Promise.resolve({ name, section }) })
}

function page() {
  return {
    page: {
      name: 'bash',
      section: '1',
      title: 'GNU Bourne Again SHell',
      description: 'command language interpreter',
      datasetReleaseId: '2026-10-28T05:14:24Z+debian+2e579f1+mandoc:1.14.6-4',
    },
  }
}

function fullPage(overrides: { description?: string; brief?: unknown } = {}) {
  return {
    kind: 'page',
    data: {
      page: { ...page().page, ...('description' in overrides ? { description: overrides.description } : {}) },
      content: {
        blocks: [],
        toc: [],
        options: [
          { anchorId: 'opt-norc', flags: '--norc', description: 'Do not read the startup file.' },
          { anchorId: 'opt-c', flags: '-c, --command', argument: 'STRING', description: 'Read commands from STRING.' },
        ],
      },
      variants: [],
      brief: overrides.brief ?? null,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  isRateLimited.mockResolvedValue(false)
  apiMocks.withDistroFallback.mockImplementation(async (distro: string, fn: (distro: string) => Promise<unknown>) => ({
    distro,
    data: await fn(distro),
  }))
  apiMocks.fetchManMetaByNameAndSection.mockResolvedValue(page())
  apiMocks.fetchManByNameAndSectionOrAlias.mockResolvedValue(fullPage())
})
afterEach(() => vi.unstubAllEnvs())

describe('man page share image route', () => {
  it('does not render invalid path parameters', async () => {
    await expect(get('bad/name', '1')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
    expect(isRateLimited).not.toHaveBeenCalled()
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('returns a private uncached 429 without rendering', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    isRateLimited.mockResolvedValueOnce(true)
    const response = await get('bash', '1')
    expect(response.status).toBe(429)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('content-security-policy')).toBeTruthy()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('does not render missing pages', async () => {
    apiMocks.withDistroFallback.mockRejectedValueOnce(new apiMocks.FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found'))
    await expect(get('missing', '1')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('does not turn backend failures into missing images', async () => {
    apiMocks.withDistroFallback.mockRejectedValueOnce(new Error('convex unavailable'))
    await expect(get('bash', '1')).rejects.toThrow('convex unavailable')
    expect(notFound).not.toHaveBeenCalled()
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('renders a found page after validation and rate limiting', async () => {
    const response = await get('bash', '1')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
    expect(ogCard).toHaveBeenCalledWith({
      name: 'bash',
      section: '1',
      label: 'Section 1',
      description: 'command language interpreter',
      distro: 'Debian',
      date: 'Oct 28, 2026',
    })
    expect(apiMocks.fetchManByNameAndSectionOrAlias).not.toHaveBeenCalled()
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })

  it('names the distro that answered after a fallback', async () => {
    apiMocks.withDistroFallback.mockImplementationOnce(async (_distro: string, fn: (distro: string) => Promise<unknown>) => ({ distro: 'debian', data: await fn('debian') }))
    await get('bash', '1', '?distro=arch')
    expect(ogCard).toHaveBeenCalledWith(expect.objectContaining({ distro: 'Debian' }))
  })

  it('dates a release whose id carries no day from the active release, only when it is that release', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { ...page().page, datasetReleaseId: 'e2e-debian-1' } })
    servingRelease.mockResolvedValueOnce({ datasetReleaseId: 'e2e-debian-1', lastUpdated: '2026-10-30T06:48:11Z' })
    await get('bash', '1')
    expect(ogCard).toHaveBeenLastCalledWith(expect.objectContaining({ date: 'Oct 30, 2026' }))
    servingRelease.mockResolvedValueOnce({ datasetReleaseId: 'e2e-debian-2', lastUpdated: '2026-10-30T06:48:11Z' })
    await get('bash', '1')
    expect(ogCard).toHaveBeenLastCalledWith(expect.objectContaining({ date: undefined }))
  })

  it('renders one option for ?flag=, from the page that defines it', async () => {
    const response = await get('bash', '1', '?flag=--command')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
    expect(apiMocks.fetchManMetaByNameAndSection).not.toHaveBeenCalled()
    expect(ogCard).toHaveBeenCalledWith(expect.objectContaining({
      name: 'bash',
      description: undefined,
      option: { flags: '-c, --command', argument: 'STRING', description: 'Read commands from STRING.' },
      distro: 'Debian',
      date: 'Oct 28, 2026',
    }))
  })

  it.each(['-q', 'command', '--command=STRING', '-c x'])('does not render a flag card for %s', async (flag) => {
    await expect(get('bash', '1', `?flag=${encodeURIComponent(flag)}`)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('keeps noindex on a long-tail flag card', async () => {
    apiMocks.fetchManByNameAndSectionOrAlias.mockResolvedValue({ ...fullPage(), data: { ...fullPage().data, page: { ...page().page, indexable: false } } })
    const response = await get('bash', '1', '?flag=--norc')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('keeps noindex on a long-tail page card', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { ...page().page, indexable: false } })
    const response = await get('bash', '1')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('labels a generated summary, used only when the page has no NAME line', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { ...page().page, description: '' } })
    apiMocks.fetchManByNameAndSectionOrAlias.mockResolvedValue(fullPage({
      description: '',
      brief: { summary: 'Runs shell commands.', examples: [], taskPhrases: [], tldr: null, generated: { provider: 'p', model: 'm-1', promptVersion: 'v1', generatedAt: '2026-10-28' } },
    }))
    await get('bash', '1')
    expect(ogCard).toHaveBeenCalledWith(expect.objectContaining({
      description: undefined,
      generated: { text: 'Runs shell commands.', label: 'generated · m-1, 2026-10-28' },
    }))
  })

  it('falls back to the title without a NAME line or a generated summary', async () => {
    apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { ...page().page, description: '' } })
    await get('bash', '1')
    expect(ogCard).toHaveBeenCalledWith(expect.objectContaining({ description: 'GNU Bourne Again SHell' }))
    expect(ogCard.mock.calls[0]).not.toHaveProperty('0.generated')
  })

  it('resolves the requested distro and defaults an unknown one to Debian', async () => {
    await get('bash', '1', '?distro=ubuntu')
    expect(apiMocks.withDistroFallback).toHaveBeenLastCalledWith('ubuntu', expect.any(Function))
    expect(apiMocks.fetchManMetaByNameAndSection).toHaveBeenLastCalledWith({ distro: 'ubuntu', name: 'bash', section: '1' })

    await get('bash', '1', '?distro=nope')
    expect(apiMocks.withDistroFallback).toHaveBeenLastCalledWith('debian', expect.any(Function))
  })
})


it('decodes encoded Perl names exactly once before OG lookup and rendering', async () => {
  apiMocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { ...page().page, name: 'foo::bar', section: '3pm' } })
  expect((await get('foo%3A%3Abar', '3pm')).status).toBe(200)
  expect(apiMocks.fetchManMetaByNameAndSection).toHaveBeenCalledWith({ distro: 'debian', name: 'foo::bar', section: '3pm' })
  expect(ogCard).toHaveBeenCalledWith(expect.objectContaining({ name: 'foo::bar', section: '3pm' }))
})

it.each(['foo%253A%253Abar', 'foo%ZZ'])('rejects malformed or doubly encoded OG names %s', async name => {
  await expect(get(name, '3pm')).rejects.toThrow('NEXT_NOT_FOUND')
  expect(apiMocks.fetchManMetaByNameAndSection).not.toHaveBeenCalled()
})

it('loads metadata from the explicit package provider', async () => {
  const response = await get('foo::bar', '3pm', '?pkg=alternate')
  expect(response.status).toBe(200)
  expect(apiMocks.fetchManMetaByNameAndSection).toHaveBeenCalledWith({ distro: 'debian', name: 'foo::bar', section: '3pm', pkg: 'alternate' })
})
