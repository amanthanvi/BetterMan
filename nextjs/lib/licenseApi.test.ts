import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))
import { fetchLicenses } from './api'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())
const pkg = (name: string) => ({ name, version: '1', hasLicenseText: true })
const first = { datasetReleaseId: 'release', packageManifest: null, packageManifestUrl: null, packages: [pkg('a')], nextCursor: null }

it('reassembles package pages pinned to one release and fetches detached provenance', async () => {
  mocks.query.mockResolvedValueOnce({ ...first, nextCursor: 'a', packageManifestUrl: 'https://files.example/manifest' })
    .mockResolvedValueOnce({ ...first, packages: [pkg('b')], nextCursor: null })
  const manifest = { packages: Array.from({ length: 9000 }, (_, i) => ({ name: `pkg${i}`, version: '1' })) }
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest })
  vi.stubGlobal('fetch', fetch)
  const result = await fetchLicenses({ distro: 'debian' })
  expect(result.packages.map((pkg) => pkg.name)).toEqual(['a', 'b'])
  expect(result.packageManifest).toEqual(manifest)
  expect(mocks.query).toHaveBeenLastCalledWith(expect.anything(), { distro: 'debian', cursor: 'a', datasetReleaseId: 'release' })
  expect(fetch).toHaveBeenCalledWith('https://files.example/manifest')
})

it('retains inline legacy provenance without a storage fetch', async () => {
  mocks.query.mockResolvedValue({ ...first, packageManifest: { old: true } })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect((await fetchLicenses({ distro: 'debian' })).packageManifest).toEqual({ old: true })
  expect(fetch).not.toHaveBeenCalled()
})

it('fails on release changes, a stalled cursor, or unreadable provenance', async () => {
  mocks.query.mockResolvedValueOnce({ ...first, nextCursor: 'a' }).mockRejectedValueOnce(new Error('RELEASE_CHANGED'))
  await expect(fetchLicenses({ distro: 'debian' })).rejects.toThrow('RELEASE_CHANGED')
  mocks.query.mockResolvedValue({ ...first, nextCursor: 'a' })
  await expect(fetchLicenses({ distro: 'debian' })).rejects.toThrow('did not advance')
  mocks.query.mockResolvedValue({ ...first, packageManifestUrl: 'https://files.example/manifest' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  await expect(fetchLicenses({ distro: 'debian' })).rejects.toThrow('Failed to load package manifest')
})

it('keeps a large manifest as a separate download instead of embedding it in HTML/API data', async () => {
  mocks.query.mockResolvedValue({ ...first, packageManifestUrl: 'https://files.example/large', packageManifestBytes: 2_000_000 })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const result = await fetchLicenses({ distro: 'debian' })
  expect(result.packageManifest).toBeNull()
  expect(result.packageManifestUrl).toBe('https://files.example/large')
  expect(fetch).not.toHaveBeenCalled()
})
