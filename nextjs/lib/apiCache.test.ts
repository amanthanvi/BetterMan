import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ action: vi.fn(), writes: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
  const result = await fn(...args)
  mocks.writes()
  return result
} }))
vi.mock('./convexClient', () => ({ getConvexClient: () => ({ action: mocks.action }) }))
import { fetchManByName, fetchManByNameAndSectionOrAlias } from './api'
beforeEach(() => vi.clearAllMocks())
it('returns an oversized manual without a cache write or a second Convex call', async () => {
  const data = { page: { name: 'gcc' }, content: { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'a'.repeat(2_100_000) }] }] }, variants: [] }
  mocks.action.mockResolvedValue({ kind: 'page', data })
  expect(await fetchManByName({ distro: 'debian', name: 'gcc' })).toEqual({ kind: 'page', data })
  expect(mocks.action).toHaveBeenCalledTimes(1)
  expect(mocks.writes).not.toHaveBeenCalled()
})
it('retains the shared cache for ordinary small manual responses', async () => {
  const data = { page: { name: 'tar' }, content: { blocks: [] }, variants: [] }
  mocks.action.mockResolvedValue({ kind: 'page', data })
  expect(await fetchManByName({ distro: 'debian', name: 'tar' })).toEqual({ kind: 'page', data })
  expect(mocks.action).toHaveBeenCalledTimes(1)
  expect(mocks.writes).toHaveBeenCalledTimes(1)
})
it.each(['lsb_release', 'SDL2_sound-devel', 'SDL_sound-devel', 'R'])('preserves provider %s through an uncached Convex lookup', async pkg => {
  const result = { kind: 'page', data: { page: { name: 'shared' }, content: {}, variants: [] } }
  mocks.action.mockResolvedValue(result)
  expect(await fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg })).toEqual(result)
  expect(mocks.action).toHaveBeenCalledExactlyOnceWith(expect.anything(), { distro: 'fedora', name: 'shared', section: '1', pkg, reportRelease: true })
  expect(mocks.writes).not.toHaveBeenCalled()
})
it('creates no persistent entries for three made-up package selectors', async () => {
  mocks.action.mockResolvedValue({ kind: 'not_found' })
  for (const pkg of ['made-up-one', 'Made_Up_Two', 'made-up-three']) {
    await expect(fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg })).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND' })
  }
  expect(mocks.action).toHaveBeenCalledTimes(3)
  expect(mocks.writes).not.toHaveBeenCalled()
})
