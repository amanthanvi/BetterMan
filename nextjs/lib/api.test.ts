import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))

import { FastApiError, isReleaseNotFoundError, search, suggest, withDistroFallback } from './api'

beforeEach(() => vi.resetAllMocks())

describe('search distro fallback', () => {
  const response = {
    query: 'ls',
    results: [{ name: 'ls', section: '1', title: 'ls', description: 'List files', highlights: [] }],
    suggestions: [],
    hasMore: false,
  }

  it.each(['freebsd', 'macos'] as const)('retries Debian search for unreleased %s', async (distro) => {
    mocks.query.mockRejectedValueOnce(new Error('ACTIVE_RELEASE_NOT_FOUND')).mockResolvedValueOnce(response)

    await expect(search({ distro, q: 'ls', section: '1', limit: 5, offset: 10 })).resolves.toEqual(response)
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.anything(), { distro, q: 'ls', section: '1', limit: 5, offset: 10 })
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.anything(), { distro: 'debian', q: 'ls', section: '1', limit: 5, offset: 10 })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

  it.each(['freebsd', 'macos'] as const)('retries Debian suggestions for unreleased %s', async (distro) => {
    const suggestions = { query: 'ls', suggestions: [{ name: 'ls', section: '1', description: 'List files' }] }
    mocks.query.mockRejectedValueOnce(new Error('ACTIVE_RELEASE_NOT_FOUND')).mockResolvedValueOnce(suggestions)

    await expect(suggest({ distro, name: 'ls' })).resolves.toEqual(suggestions)
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.anything(), { distro, name: 'ls' })
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.anything(), { distro: 'debian', name: 'ls' })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

  it('does not retry a missing Debian release', async () => {
    mocks.query.mockRejectedValue(new Error('ACTIVE_RELEASE_NOT_FOUND'))
    await expect(search({ distro: 'debian', q: 'ls' })).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' })
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('does not mask unrelated search failures', async () => {
    const error = new Error('rate limited')
    mocks.query.mockRejectedValue(error)
    await expect(search({ distro: 'freebsd', q: 'ls' })).rejects.toBe(error)
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('propagates a failed Debian suggestion fallback', async () => {
    mocks.query.mockRejectedValue(new Error('ACTIVE_RELEASE_NOT_FOUND'))
    await expect(suggest({ distro: 'macos', name: 'ls' })).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })
})

describe('api error helpers', () => {
  it('identifies missing release errors by code', () => {
    const err = new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')

    expect(isReleaseNotFoundError(err)).toBe(true)
    expect(isReleaseNotFoundError(new FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found'))).toBe(false)
  })

  it('falls back to Debian only for missing non-default releases', async () => {
    const calls: string[] = []
    const result = await withDistroFallback('ubuntu', async (distro) => {
      calls.push(distro)
      if (distro === 'ubuntu') {
        throw new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')
      }
      return `ok:${distro}`
    })

    expect(result).toEqual({ distro: 'debian', data: 'ok:debian' })
    expect(calls).toEqual(['ubuntu', 'debian'])
  })

  it('exposes the Debian attempt when the fallback page is also missing', async () => {
    const calls: string[] = []

    await expect(
      withDistroFallback('ubuntu', async (distro) => {
        calls.push(distro)
        if (distro === 'ubuntu') {
          throw new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')
        }
        throw new FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found')
      }),
    ).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND' })

    expect(calls).toEqual(['ubuntu', 'debian'])
  })
})
