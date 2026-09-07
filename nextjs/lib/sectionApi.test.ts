import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))

import { listSection } from './api'

beforeEach(() => vi.clearAllMocks())

describe('section API client', () => {
  it('retains default offset arguments for existing callers', async () => {
    const response = { section: '1', results: [], nextCursor: null, prevCursor: null, hasMore: false }
    mocks.query.mockResolvedValue(response)
    await expect(listSection({ distro: 'debian', section: '1' })).resolves.toBe(response)
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), { distro: 'debian', section: '1', limit: 200, offset: 0 })
  })

  it.each(['cursor', 'before'] as const)('includes %s in the cached query arguments', async (direction) => {
    mocks.query.mockResolvedValue({ section: '1', results: [] })
    await listSection({ distro: 'ubuntu', section: '1', limit: 50, offset: 6000, [direction]: 'tail' })
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      distro: 'ubuntu', section: '1', limit: 50, offset: 6000, [direction]: 'tail',
    })
  })

  it('keeps the existing section-not-found error', async () => {
    mocks.query.mockResolvedValue(null)
    await expect(listSection({ distro: 'debian', section: '9', cursor: 'tail' }))
      .rejects.toMatchObject({ status: 404, code: 'SECTION_NOT_FOUND' })
  })
})
