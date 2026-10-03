import { beforeEach, describe, expect, it, vi } from 'vitest'

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)

const ogCard = vi.hoisted(() => vi.fn(async () => new Response('png', { status: 200 })))

const headersMock = vi.hoisted(() => vi.fn(async () => new Headers()))

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
    withDistroFallback: vi.fn(),
  }
})

vi.mock('next/headers', () => ({ headers: headersMock }))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('../../../../lib/og/card', () => ({ ogCard, OG_SIZE: { width: 1200, height: 630 } }))
vi.mock('../../../../lib/rateLimit', () => ({ isRateLimited }))
vi.mock('../../../../lib/api', () => ({
  FastApiError: apiMocks.FastApiError,
  fetchManMetaByNameAndSection: apiMocks.fetchManMetaByNameAndSection,
  withDistroFallback: apiMocks.withDistroFallback,
}))
vi.mock('../../../../components/man/RunningHead', () => ({ sectionLabel: (section: string) => `Section ${section}` }))

import Image from './opengraph-image'

function page() {
  return {
    page: {
      name: 'bash',
      section: '1',
      title: 'GNU Bourne Again SHell',
      description: 'command language interpreter',
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
})

describe('man page Open Graph image route', () => {
  it('does not render invalid path parameters', async () => {
    await expect(Image({ params: Promise.resolve({ name: 'bad/name', section: '1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
    expect(isRateLimited).not.toHaveBeenCalled()
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('returns a private uncached 429 without rendering', async () => {
    isRateLimited.mockResolvedValueOnce(true)
    const response = await Image({ params: Promise.resolve({ name: 'bash', section: '1' }) })
    expect(response.status).toBe(429)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('does not render missing pages', async () => {
    apiMocks.withDistroFallback.mockRejectedValueOnce(new apiMocks.FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found'))
    await expect(Image({ params: Promise.resolve({ name: 'missing', section: '1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('does not turn backend failures into missing images', async () => {
    apiMocks.withDistroFallback.mockRejectedValueOnce(new Error('convex unavailable'))
    await expect(Image({ params: Promise.resolve({ name: 'bash', section: '1' }) })).rejects.toThrow('convex unavailable')
    expect(notFound).not.toHaveBeenCalled()
    expect(ogCard).not.toHaveBeenCalled()
  })

  it('renders a found page after validation and rate limiting', async () => {
    await Image({ params: Promise.resolve({ name: 'bash', section: '1' }) })
    expect(ogCard).toHaveBeenCalledWith({
      head: 'BASH(1)',
      label: 'Section 1',
      name: 'bash(1)',
      description: 'command language interpreter',
    })
  })
})
