import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '../../lib/api'
import type { Distro } from '../../lib/distro'

const mocks = vi.hoisted(() => ({
  cookieDistro: undefined as string | undefined,
  search: vi.fn(),
  releases: new Set<string>(['debian', 'ubuntu']),
  navigation: (kind: string) =>
    vi.fn((location?: string) => {
      throw new Error(location === undefined ? kind : `${kind} ${location}`)
    }),
}))
const navigation = vi.hoisted(() => ({
  notFound: mocks.navigation('notFound'),
  permanentRedirect: mocks.navigation('308'),
  redirect: mocks.navigation('307'),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'bm-distro' && mocks.cookieDistro ? { value: mocks.cookieDistro } : undefined),
  }),
}))
vi.mock('next/navigation', () => navigation)
vi.mock('../../lib/api', () => ({
  search: mocks.search,
  withDistroFallback: async (distro: Distro, fn: (distro: Distro) => Promise<SearchResponse>) => {
    const active = mocks.releases.has(distro) ? distro : 'debian'
    return { distro: active, data: await fn(active) }
  },
}))

import ShortUrlPage from './page'

function visit(path: string, sp: Record<string, string | string[]> = {}) {
  return ShortUrlPage({
    params: Promise.resolve({ short: path.split('/').slice(1) }),
    searchParams: Promise.resolve(sp),
  })
}

function results(...hits: Array<Partial<SearchResponse['results'][number]>>): SearchResponse {
  return {
    query: '',
    results: hits.map((hit) => ({ name: 'tar', section: '1', title: '', description: '', highlights: [], ...hit })),
    suggestions: [],
    hasMore: false,
    nextOffset: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookieDistro = undefined
  vi.stubEnv('BM_RESERVED_PATH_SEGMENTS', ['api', 'man', 'search', 'section'].join('/'))
})

describe('short URL redirects', () => {
  it.each([
    ['/tar', {}, '308 /man/tar'],
    ['/tar', { distro: 'ubuntu' }, '308 /man/tar?distro=ubuntu'],
    ['/tar.1', {}, '308 /man/tar/1'],
    ['/ssh_config.5', { distro: 'fedora', x: ['1', '2'] }, '308 /man/ssh_config/5?distro=fedora&x=1&x=2'],
    ['/2/open', {}, '308 /man/open/2'],
    ['/c%2B%2B', {}, '308 /man/c%2B%2B'],
    ['/Foo%3A%3ABar.3pm', {}, '308 /man/foo%3A%3Abar/3pm'],
  ])('%s %j answers %s without a lookup', async (path, sp, expected) => {
    await expect(visit(path, sp)).rejects.toHaveProperty('message', expected)
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it.each(['/man', '/api', '/search/-x', '/tar/x', '/a/b/c', '/tar%E0%A4', '/tar.txt', '/wp-login.php', '/x.png/-x'])(
    'leaves %s to the 404 page without a lookup',
    async (path) => {
      await expect(visit(path)).rejects.toHaveProperty('message', 'notFound')
      expect(navigation.permanentRedirect).not.toHaveBeenCalled()
      expect(mocks.search).not.toHaveBeenCalled()
    },
  )

  it('fails loudly when the build did not inline the reserved segments', async () => {
    vi.stubEnv('BM_RESERVED_PATH_SEGMENTS', '')
    await expect(visit('/man')).rejects.toHaveProperty('message', 'BM_RESERVED_PATH_SEGMENTS is not set')
  })
})

describe('short URL options', () => {
  it('lands on the option row the option index names', async () => {
    mocks.search.mockResolvedValue(
      results({ name: 'tar', section: '1', match: 'option', anchorId: 'x' }),
    )
    await expect(visit('/tar/--extract')).rejects.toHaveProperty('message', '307 /man/tar/1?flag=--extract#x')
    expect(mocks.search).toHaveBeenCalledWith({ distro: 'debian', q: 'tar --extract', section: undefined, limit: 10 })
  })

  it('skips prefix matches and non-option hits for other names', async () => {
    mocks.search.mockResolvedValue(
      results(
        { name: 'tar', section: '1' },
        { name: 'tarsnap', section: '1', match: 'option', anchorId: 'c' },
        { name: 'TAR', section: '5', match: 'option', anchorId: 'opt-create' },
      ),
    )
    await expect(visit('/tar/-c')).rejects.toHaveProperty('message', '307 /man/tar/5?flag=-c#opt-create')
  })

  it('scopes the lookup to the reader distro and leaves a bare URL bare', async () => {
    mocks.cookieDistro = 'ubuntu'
    mocks.search.mockResolvedValue(results({ match: 'option', anchorId: 'C' }))
    await expect(visit('/tar.1/-C')).rejects.toHaveProperty('message', '307 /man/tar/1?flag=-C#C')
    expect(mocks.search).toHaveBeenCalledWith({ distro: 'ubuntu', q: 'tar -C', section: '1', limit: 10 })
  })

  it('searches the Debian fallback and keeps the explicit distro', async () => {
    mocks.search.mockResolvedValue(results({ match: 'option', anchorId: 'x' }))
    await expect(visit('/tar/-x', { distro: 'arch' })).rejects.toHaveProperty('message', '307 /man/tar/1?distro=arch&flag=-x#x')
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ distro: 'debian' }))
  })

  it('leaves a flag the options index cannot key off the landing URL', async () => {
    mocks.search.mockResolvedValue(results({ match: 'option', anchorId: 'x' }))
    await expect(visit('/tar/-xzf=1')).rejects.toHaveProperty('message', '307 /man/tar/1#x')
  })

  it.each([
    ['/tar/-x', {}, '307 /man/tar'],
    ['/tar.1/-x', { distro: 'ubuntu' }, '307 /man/tar/1?distro=ubuntu'],
    ['/tar/-x', { distro: 'debian' }, '307 /man/tar?distro=debian'],
  ])('lands %s %j on the page when the option search fails', async (path, sp, expected) => {
    mocks.search.mockRejectedValue(new Error('Convex unavailable'))
    await expect(visit(path, sp)).rejects.toHaveProperty('message', expected)
  })

  it.each([
    ['/tar/-q', {}, '307 /man/tar'],
    ['/tar.1/-q', {}, '307 /man/tar/1'],
    ['/tar/-q', { distro: 'arch' }, '307 /man/tar?distro=arch'],
    ['/tar.1/-q', { distro: 'debian' }, '307 /man/tar/1?distro=debian'],
  ])('lands %s %j on the page when no option matches', async (path, sp, expected) => {
    mocks.search.mockResolvedValue(results())
    await expect(visit(path, sp)).rejects.toHaveProperty('message', expected)
  })
})
