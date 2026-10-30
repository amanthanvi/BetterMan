import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  limited: false,
  fetchManByNameAndSectionOrAlias: vi.fn(),
  fetchRelated: vi.fn(),
  fetchManResolve: vi.fn(),
  fetchManDistros: vi.fn(),
  suggest: vi.fn(),
}))

vi.mock('./rateLimit', () => ({ isRateLimited: async () => mocks.limited }))
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    FastApiError: actual.FastApiError,
    withDistroFallback: actual.withDistroFallback,
    servedRelease: actual.servedRelease,
    answeredBy: actual.answeredBy,
    fetchManByNameAndSectionOrAlias: mocks.fetchManByNameAndSectionOrAlias,
    fetchRelated: mocks.fetchRelated,
    fetchManResolve: mocks.fetchManResolve,
    fetchManDistros: mocks.fetchManDistros,
    suggest: mocks.suggest,
  }
})

import { FastApiError } from './api'
import { lookupManPage, manMiss, resolveManName } from './manLookup'

const pageNotFound = () => new FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found')
const releaseNotFound = () => new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')
const page = { kind: 'page', data: { page: { name: 'tar', section: '1' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.limited = false
  mocks.fetchManByNameAndSectionOrAlias.mockResolvedValue(page)
  mocks.fetchRelated.mockImplementation(async ({ distro }: { distro: string }) => ({ items: [{ name: `related-${distro}` }] }))
  mocks.fetchManResolve.mockRejectedValue(pageNotFound())
  mocks.suggest.mockResolvedValue({ query: 'gizp', suggestions: [{ name: 'gzip', section: '1', description: '' }] })
  mocks.fetchManDistros.mockResolvedValue({ distros: ['ubuntu'] })
})

describe('lookupManPage', () => {
  it('does not read related pages after an explicit selector fails provider proof', async () => {
    mocks.fetchManByNameAndSectionOrAlias.mockRejectedValue(pageNotFound())
    await expect(lookupManPage({ name: 'tar', section: '1', distro: 'debian', pkg: 'invented' })).resolves.toMatchObject({ kind: 'miss' })
    expect(mocks.fetchRelated).not.toHaveBeenCalled()
  })

  it('reads the document and related pages together, keyed on the release', async () => {
    await expect(lookupManPage({ name: 'tar', section: '1', distro: 'debian', release: 'r1' })).resolves.toEqual({
      kind: 'page',
      distro: 'debian',
      data: page.data,
      related: [{ name: 'related-debian' }],
      servedRelease: null,
    })
    expect(mocks.fetchManByNameAndSectionOrAlias).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', section: '1', release: 'r1' })
    expect(mocks.fetchRelated).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', section: '1', release: 'r1' })
  })

  it('falls back to Debian for a distro without a release, related pages included', async () => {
    mocks.fetchManByNameAndSectionOrAlias.mockImplementation(async ({ distro }: { distro: string }) => {
      if (distro === 'arch') throw releaseNotFound()
      return page
    })
    await expect(lookupManPage({ name: 'tar', section: '1', distro: 'arch' })).resolves.toMatchObject({ distro: 'debian', related: [{ name: 'related-debian' }] })
  })

  it('reports an alias target and a miss', async () => {
    mocks.fetchManByNameAndSectionOrAlias.mockResolvedValueOnce({ kind: 'alias', name: 'gzip', section: '1' })
    await expect(lookupManPage({ name: 'gunzip', section: '1', distro: 'debian' })).resolves.toEqual({ kind: 'alias', name: 'gzip', section: '1', distro: 'debian', servedRelease: null })
    mocks.fetchManByNameAndSectionOrAlias.mockRejectedValueOnce(pageNotFound())
    await expect(lookupManPage({ name: 'ta', section: '9', distro: 'debian' })).resolves.toEqual({ kind: 'miss', servedRelease: null })
  })

  it('passes other failures through, so they are errors, not 404s', async () => {
    mocks.fetchManByNameAndSectionOrAlias.mockRejectedValueOnce(new Error('Convex down'))
    await expect(lookupManPage({ name: 'tar', section: '1', distro: 'debian' })).rejects.toThrow('Convex down')
  })
})

describe('resolveManName', () => {
  it('resolves a lowercased name and returns null for a miss', async () => {
    mocks.fetchManResolve.mockResolvedValueOnce({ kind: 'page', name: 'tar', section: '1' })
    await expect(resolveManName('TAR', 'debian', 'r1')).resolves.toEqual({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: null })
    expect(mocks.fetchManResolve).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', release: 'r1' })
    await expect(resolveManName('gizp', 'debian')).resolves.toEqual({ result: null, servedRelease: null })
  })
})

describe('manMiss', () => {
  const headers = new Headers()

  it('returns suggestions and the distros that have the page', async () => {
    await expect(manMiss({ name: 'Systemctl', section: '1', distro: 'macos', urlDistro: 'macos', headers })).resolves.toEqual({
      name: 'Systemctl',
      section: '1',
      distro: 'macos',
      urlDistro: 'macos',
      suggestions: [{ name: 'gzip', section: '1', description: '' }],
      distros: ['ubuntu'],
      limited: false,
      answeredByKey: true,
    })
    expect(mocks.suggest).toHaveBeenCalledWith({ distro: 'macos', name: 'systemctl', typos: true })
    expect(mocks.fetchManDistros).toHaveBeenCalledWith({ name: 'systemctl', section: '1' })
  })

  it('marks a rate-limited miss and skips the reads for a name that cannot be a page', async () => {
    mocks.limited = true
    await expect(manMiss({ name: 'gizp', section: null, distro: 'debian', urlDistro: null, headers })).resolves.toMatchObject({ suggestions: [], distros: [], limited: true })
    mocks.limited = false
    await expect(manMiss({ name: '<script>', section: null, distro: 'debian', urlDistro: null, headers })).resolves.toMatchObject({ suggestions: [], limited: false })
    expect(mocks.suggest).not.toHaveBeenCalled()
    expect(mocks.fetchManDistros).not.toHaveBeenCalled()
  })
})
