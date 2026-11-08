import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '../../lib/api'
import type { Distro } from '../../lib/distro'

const mocks = vi.hoisted(() => ({
  cookieDistro: undefined as string | undefined,
  search: vi.fn(),
  resolveManName: vi.fn(),
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
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (name === 'bm-distro' && mocks.cookieDistro ? { value: mocks.cookieDistro } : undefined),
  }),
}))
vi.mock('next/navigation', () => navigation)
vi.mock('../../lib/manLookup', () => ({ resolveManName: mocks.resolveManName }))
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
  mocks.resolveManName.mockResolvedValue({ result: null, servedRelease: null })
  vi.stubEnv('BM_RESERVED_PATH_SEGMENTS', ['api', 'man', 'search', 'section'].join('/'))
})

describe('short URL redirects', () => {
  it('keeps a transient name lookup failure temporary', async () => {
    mocks.resolveManName.mockRejectedValueOnce(new Error('Convex unavailable'))
    await expect(visit('/time', { distro: 'fedora', pkg: 'time' }))
      .rejects.toHaveProperty('message', '307 /man/time?distro=fedora&pkg=time')
    expect(navigation.permanentRedirect).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'page', name: 'tar', section: '1' }, '/man/tar/1'],
    [{ kind: 'ambiguous', preferred: '1', options: [{ section: '1' }, { section: '3tcl' }] }, '/man/tar/1'],
    [{ kind: 'alias', name: 'gzip', section: '1', pkg: 'gzip' }, '/man/gzip/1?pkg=gzip'],
  ])('resolves a short name temporarily without changing the picker', async (result, destination) => {
    mocks.resolveManName.mockResolvedValue({ result, servedRelease: 'r1' })
    await expect(visit('/tar')).rejects.toHaveProperty('message', `307 ${destination}`)
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('keeps encoded names, distro, language and package on a preferred redirect', async () => {
    mocks.resolveManName.mockResolvedValue({ result: { kind: 'ambiguous', preferred: '3pm' }, servedRelease: null })
    await expect(visit('/Foo%3A%3ABar', { distro: 'ubuntu', lang: 'de', pkg: 'perl', utm_source: 'hn' }))
      .rejects.toHaveProperty('message', '307 /man/foo%3A%3Abar/3pm?distro=ubuntu&lang=de&pkg=perl')
    expect(mocks.resolveManName).toHaveBeenCalledWith('foo::bar', 'ubuntu', undefined, null)
  })

  it.each([
    ['/tar', {}, '307 /man/tar'],
    ['/tar', { distro: 'ubuntu' }, '307 /man/tar?distro=ubuntu'],
    ['/tar.1', {}, '308 /man/tar/1'],
    ['/ssh_config.5', { distro: 'fedora', x: ['1', '2'] }, '308 /man/ssh_config/5?distro=fedora'],
    ['/tar', { utm_source: 'hn', distro: ['ubuntu', 'arch'], pkg: 'tar' }, '307 /man/tar?distro=ubuntu&pkg=tar'],
    ['/tar.1', { portability: 'text', flag: '-x', lang: 'de' }, '308 /man/tar/1?portability=text&flag=-x&lang=de'],
    ['/2/open', {}, '308 /man/open/2'],
    ['/c%2B%2B', {}, '307 /man/c%2B%2B'],
    ['/Foo%3A%3ABar.3pm', {}, '308 /man/foo%3A%3Abar/3pm'],
  ])('%s %j answers %s without an option search', async (path, sp, expected) => {
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
  it.each([false, true])('uses the name preference when the flag search has no hit (failure %s)', async failed => {
    if (failed) mocks.search.mockRejectedValueOnce(new Error('Search unavailable'))
    else mocks.search.mockResolvedValueOnce(results({ name: 'time', section: '3', match: 'task' }))
    mocks.resolveManName.mockResolvedValueOnce({ result: { kind: 'ambiguous', preferred: '1', options: [{ section: '1' }, { section: '3' }] }, servedRelease: 'r1' })
    await expect(visit('/time/-Q', { distro: 'ubuntu', pkg: 'time', lang: 'de' }))
      .rejects.toHaveProperty('message', '307 /man/time/1?distro=ubuntu&pkg=time&lang=de')
    expect(mocks.resolveManName).toHaveBeenCalledWith('time', 'ubuntu', undefined, null)
  })

  it.each([['debian', '3', 'library'], ['freebsd', '2', 'syscall']])('uses %s man order only among pages with the flag', async (distro, section, anchor) => {
    mocks.releases.add(distro)
    mocks.search.mockResolvedValue(results(
      { section: '1' },
      { section: '2', match: 'option', anchorId: 'syscall' },
      { section: '3', match: 'option', anchorId: 'library' },
    ))
    await expect(visit('/tar/-x', { distro })).rejects.toHaveProperty('message', `307 /man/tar/${section}?distro=${distro}&flag=-x#${anchor}`)
  })
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
