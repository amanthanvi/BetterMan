import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ action: vi.fn(), query: vi.fn(), writes: vi.fn(), cache: new Map<string, unknown>() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, key: string[]) => async (...args: unknown[]) => {
  const id = JSON.stringify([key, args])
  if (mocks.cache.has(id)) return mocks.cache.get(id)
  const result = await fn(...args)
  mocks.cache.set(id, result)
  mocks.writes()
  return result
} }))
vi.mock('./convexClient', () => ({ getConvexClient: () => ({ action: mocks.action, query: mocks.query }) }))
import { fetchManByName, fetchManByNameAndSectionOrAlias } from './api'
import { resolveManName } from './manLookup'
beforeEach(() => { vi.clearAllMocks(); mocks.cache.clear() })
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
it.each(['lsb_release', 'SDL2_sound-devel', 'SDL_sound-devel', 'R'])('proves provider %s before caching its unchanged selector', async pkg => {
  const result = { kind: 'page', data: { page: { name: 'shared' }, content: {}, variants: [], providers: { packages: ['default', pkg], defaultPackage: 'default' } } }
  mocks.query.mockResolvedValue({ packages: ['default', pkg] })
  mocks.action.mockResolvedValue(result)
  expect(await fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg })).toEqual(result)
  expect(mocks.action).toHaveBeenCalledTimes(1)
  expect(mocks.action).toHaveBeenLastCalledWith(expect.anything(), { distro: 'fedora', name: 'shared', section: '1', pkg, reportRelease: true })
  await fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg })
  expect(mocks.action).toHaveBeenCalledTimes(1)
})
it('repeated invented selectors reuse only route metadata and cause no provider lookups or entries', async () => {
  mocks.query.mockResolvedValue({ packages: ['real'] })
  for (let repeat = 0; repeat < 3; repeat++) for (const pkg of ['made-up-one', 'Made_Up_Two', 'made-up-three']) {
    await expect(fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg })).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND' })
  }
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith(expect.anything(), { distro: 'fedora', name: 'shared', section: '1' })
  expect(mocks.action).not.toHaveBeenCalled()
  expect([...mocks.cache.keys()].every(key => key.includes('providers-for'))).toBe(true)
  expect(mocks.writes).toHaveBeenCalledTimes(1)
})

it('proves providers on alias-owned routes without looking up invented selectors', async () => {
  mocks.query.mockResolvedValue({ packages: ['ftp.app', 'tnftp'] })
  mocks.action.mockResolvedValue({ kind: 'page', data: { page: { sourcePackage: 'ftp.app' } } })
  await expect(fetchManByNameAndSectionOrAlias({ distro: 'debian', name: 'ftp', section: '1', pkg: 'invented' })).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND' })
  expect(mocks.action).not.toHaveBeenCalled()
  await expect(fetchManByNameAndSectionOrAlias({ distro: 'debian', name: 'ftp', section: '1', pkg: 'ftp.app' })).resolves.toMatchObject({ kind: 'page' })
  expect(mocks.action).toHaveBeenCalledTimes(1)
})

it('never stores provider proof from another release under the requested release key', async () => {
  mocks.query.mockResolvedValue({ packages: ['B-only'], datasetReleaseId: 'B' })
  for (let repeat = 0; repeat < 2; repeat++) {
    await expect(fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg: 'A-only', release: 'A' })).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND', datasetReleaseId: 'B' })
  }
  expect(mocks.query).toHaveBeenCalledTimes(2)
  expect(mocks.cache.size).toBe(0)
  mocks.query.mockResolvedValue({ packages: ['A-only'], datasetReleaseId: 'A' })
  mocks.action.mockResolvedValue({ kind: 'page', data: { page: { datasetReleaseId: 'A' } } })
  await fetchManByNameAndSectionOrAlias({ distro: 'fedora', name: 'shared', section: '1', pkg: 'A-only', release: 'A' })
  expect(mocks.query).toHaveBeenCalledTimes(3)
  expect(mocks.action).toHaveBeenCalledTimes(1)
  expect(mocks.cache.size).toBe(2)
})


it.each(['de2', null, undefined])('does not cache or key an English fallback read against translated release %s under de1', async active => {
  mocks.query.mockResolvedValue({ kind: 'page', name: 'tar', section: '5', datasetReleaseId: 'en1', translatedReleaseId: active })
  const key = { lang: 'de' as const, known: true, datasetReleaseId: 'de1' }
  const skewed = await resolveManName('tar', 'debian', 'en1', key)
  expect(skewed).toMatchObject({ result: { section: '5' }, servedRelease: null })
  expect(mocks.cache.size).toBe(0)
  mocks.query.mockResolvedValue({ kind: 'page', name: 'tar', section: '1', datasetReleaseId: 'de1' })
  const rolledBack = await resolveManName('tar', 'debian', 'en1', key)
  expect(rolledBack).toMatchObject({ result: { section: '1' }, servedRelease: 'en1' })
  expect(mocks.query).toHaveBeenCalledTimes(2)
})

it.each(['de1', null])('retains keyed English fallbacks when their translated pointer matches %s', async translated => {
  mocks.query.mockResolvedValue({ kind: 'page', name: 'tar', section: '5', datasetReleaseId: 'en1', translatedReleaseId: translated })
  for (let i = 0; i < 2; i++) {
    expect(await resolveManName('tar', 'debian', 'en1', { lang: 'de', known: true, datasetReleaseId: translated }))
      .toMatchObject({ result: { section: '5' }, servedRelease: 'en1' })
  }
  expect(mocks.query).toHaveBeenCalledTimes(1)
})

it('keeps a name miss private when its translated pointer differs from the key', async () => {
  mocks.query.mockResolvedValue({ kind: 'not_found', datasetReleaseId: 'en1', translatedReleaseId: 'de2' })
  expect(await resolveManName('tar', 'debian', 'en1', { lang: 'de', known: true, datasetReleaseId: 'de1' }))
    .toEqual({ result: null, servedRelease: null })
  expect(mocks.cache.size).toBe(0)
})
