import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  path: '/man/gizp' as string | null,
  limited: false,
  fetchManMetaByNameAndSection: vi.fn(),
  fetchManByNameAndSectionOrAlias: vi.fn(),
  fetchManResolve: vi.fn(),
  fetchManDistros: vi.fn(),
  suggest: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(mocks.path ? { 'x-bm-path': mocks.path } : {}),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('./rateLimit', () => ({ isRateLimited: async () => mocks.limited }))
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    FastApiError: actual.FastApiError,
    withDistroFallback: actual.withDistroFallback,
    fetchManMetaByNameAndSection: mocks.fetchManMetaByNameAndSection,
    fetchManByNameAndSectionOrAlias: mocks.fetchManByNameAndSectionOrAlias,
    fetchManResolve: mocks.fetchManResolve,
    fetchManDistros: mocks.fetchManDistros,
    suggest: mocks.suggest,
  }
})

import { FastApiError } from './api'
import { requestedManMiss } from './manLookup'

const pageNotFound = () => new FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.path = '/man/gizp'
  mocks.limited = false
  mocks.fetchManResolve.mockRejectedValue(pageNotFound())
  mocks.fetchManMetaByNameAndSection.mockRejectedValue(pageNotFound())
  mocks.fetchManByNameAndSectionOrAlias.mockRejectedValue(pageNotFound())
  mocks.suggest.mockResolvedValue({ query: 'gizp', suggestions: [{ name: 'gzip', section: '1', description: '' }] })
  mocks.fetchManDistros.mockResolvedValue({ distros: ['ubuntu'] })
})

describe('requestedManMiss', () => {
  it('reads nothing more when the requested page exists', async () => {
    mocks.path = '/man/tar/1'
    mocks.fetchManMetaByNameAndSection.mockResolvedValue({ page: { name: 'tar', section: '1' } })
    await expect(requestedManMiss()).resolves.toBeNull()
    expect(mocks.suggest).not.toHaveBeenCalled()
    expect(mocks.fetchManDistros).not.toHaveBeenCalled()
  })

  it('returns suggestions and distros for a bare-name miss', async () => {
    await expect(requestedManMiss()).resolves.toEqual({
      name: 'gizp',
      section: null,
      distro: 'debian',
      urlDistro: null,
      suggestions: [{ name: 'gzip', section: '1', description: '' }],
      distros: ['ubuntu'],
    })
    expect(mocks.suggest).toHaveBeenCalledWith({ distro: 'debian', name: 'gizp', typos: true })
    expect(mocks.fetchManDistros).toHaveBeenCalledWith({ name: 'gizp', section: null })
  })

  it('takes the section and distro from the forwarded path', async () => {
    mocks.path = '/man/Systemctl/1?distro=macos'
    const miss = await requestedManMiss()
    expect(miss).toMatchObject({ name: 'Systemctl', section: '1', distro: 'macos', urlDistro: 'macos' })
    expect(mocks.fetchManDistros).toHaveBeenCalledWith({ name: 'systemctl', section: '1' })
  })

  it('skips the assistance reads when rate limited or the name cannot be a page', async () => {
    mocks.limited = true
    await expect(requestedManMiss()).resolves.toMatchObject({ suggestions: [], distros: [] })
    mocks.limited = false
    mocks.path = '/man/%3Cscript%3E'
    await expect(requestedManMiss()).resolves.toMatchObject({ name: '<script>', suggestions: [], distros: [] })
    expect(mocks.suggest).not.toHaveBeenCalled()
    expect(mocks.fetchManDistros).not.toHaveBeenCalled()
  })

  it('renders nothing without a forwarded man path', async () => {
    mocks.path = null
    await expect(requestedManMiss()).resolves.toBeNull()
    mocks.path = '/man/tar/1/og'
    await expect(requestedManMiss()).resolves.toBeNull()
    expect(mocks.fetchManResolve).not.toHaveBeenCalled()
  })
})
