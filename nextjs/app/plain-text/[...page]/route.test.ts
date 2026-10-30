import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { FastApiError, fetchManResolve, fetchManByNameAndSectionOrAlias } from '@/lib/api'
import { isRateLimited } from '@/lib/rateLimit'
import type { ManPageResponse } from '@/lib/docModel'
import { GET, HEAD } from './route'

vi.mock('@/lib/api', async (original) => ({
  ...await original<typeof import('@/lib/api')>(),
  fetchManResolve: vi.fn(),
  fetchManByNameAndSectionOrAlias: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn() }))

const manual: ManPageResponse = {
  page: { id: 'tar', datasetReleaseId: 'test', distro: 'debian', locale: 'en', name: 'tar', section: '1', title: 'tar(1)', description: 'an archiving utility' },
  variants: [],
  content: { blocks: [], toc: [], synopsis: ['tar [OPTION]...'] },
}
const ctx = (page = ['tar', '1']) => ({ params: Promise.resolve({ page }) })
const req = (query = '') => new Request(`https://betterman.sh/man/tar/1.txt${query}`, { headers: { 'x-vercel-forwarded-for': '192.0.2.1', 'x-bm-release-token': 'test-token', 'x-bm-release': JSON.stringify({ datasetReleaseId: 'test', distro: 'debian', pageCount: 1, lastUpdated: '' }) } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('BM_RELEASE_TOKEN', 'test-token')
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
  vi.mocked(isRateLimited).mockResolvedValue(false)
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: manual })
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'page', name: 'tar', section: '1', title: 'tar(1)', description: 'archive', datasetReleaseId: 'r1' })
})
afterEach(() => vi.unstubAllEnvs())

it('uses the existing section payload, with a canonical HTML pointer and page-API caching', async () => {
  const request = req('?distro=ubuntu')
  const res = await GET(request, ctx())
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=3600')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('link')).toBe('<https://betterman.sh/man/tar/1?distro=ubuntu>; rel="canonical"')
  expect(await res.text()).toContain('TAR(1)')
  expect(isRateLimited).toHaveBeenCalledWith(request.headers, 'page')
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledExactlyOnceWith({ distro: 'ubuntu', name: 'tar', section: '1', release: 'test' })
  expect(fetchManResolve).not.toHaveBeenCalled()
})

it('resolves the short form to the HTML section cache and ignores browser distro cookies', async () => {
  const request = req()
  request.headers.set('cookie', 'bm-distro=ubuntu')
  const res = await GET(request, ctx(['TAR']))
  expect(res.status).toBe(308)
  expect(res.headers.get('location')).toBe('/man/tar/1.txt')
  expect(fetchManResolve).toHaveBeenCalledExactlyOnceWith({ distro: 'debian', name: 'tar', release: 'test' })
  expect(fetchManByNameAndSectionOrAlias).not.toHaveBeenCalled()
})

it('fails closed at the page limit before fetching a payload', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.mocked(isRateLimited).mockResolvedValue(true)
  const res = await GET(req(), ctx())
  expect(res.status).toBe(429)
  expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000')
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(await res.text()).toBe('Too many requests\n')
  expect(fetchManByNameAndSectionOrAlias).not.toHaveBeenCalled()
})

it.each([['/bad'], ['tar', 'invalid'], ['tar', '1', 'extra']])('rejects invalid route components %j without a read', async (...page) => {
  expect((await GET(req(), ctx(page))).status).toBe(404)
  expect(isRateLimited).not.toHaveBeenCalled()
})

it('rejects an invalid distro without a read', async () => {
  expect((await GET(req('?distro=other'), ctx())).status).toBe(400)
  expect(isRateLimited).not.toHaveBeenCalled()
})

it('returns a text 404 for unknown pages', async () => {
  vi.mocked(fetchManByNameAndSectionOrAlias).mockRejectedValue(new FastApiError(404, 'PAGE_NOT_FOUND', 'Missing'))
  const res = await GET(req(), ctx())
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('Page not found\n')
})

it('falls back only for an unavailable release and uses its canonical distro', async () => {
  vi.mocked(fetchManByNameAndSectionOrAlias).mockRejectedValueOnce(new FastApiError(404, 'RELEASE_NOT_FOUND', 'Missing'))
  const res = await GET(req('?distro=arch'), ctx())
  expect(res.status).toBe(200)
  expect(res.headers.get('link')).toBe('<https://betterman.sh/man/tar/1>; rel="canonical"')
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenLastCalledWith({ distro: 'debian', name: 'tar', section: '1', release: 'test' })
})

it('offers explicit text URLs for ambiguous names', async () => {
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'ambiguous', indexable: true, options: [{ section: '3', title: 'printf(3)', description: 'format' }], datasetReleaseId: 'r1' })
  const res = await GET(req('?distro=ubuntu'), ctx(['printf']))
  expect(res.status).toBe(409)
  expect(await res.text()).toContain('/man/printf/3.txt?distro=ubuntu')
})

it('keeps only the request distro in redirects and choices, Debian included, after a fallback', async () => {
  vi.mocked(fetchManResolve).mockRejectedValueOnce(new FastApiError(404, 'RELEASE_NOT_FOUND', 'Missing'))
    .mockResolvedValueOnce({ kind: 'alias', name: 'gzip', section: '1', datasetReleaseId: 'r1' })
  const fallback = await GET(req('?distro=arch'), ctx(['gunzip']))
  expect(fallback.headers.get('location')).toBe('/man/gzip/1.txt?distro=arch')

  const explicitDebian = await GET(req('?distro=debian'), ctx(['TAR']))
  expect(explicitDebian.headers.get('location')).toBe('/man/tar/1.txt?distro=debian')

  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'ambiguous', indexable: true, options: [{ section: '3', title: 'printf(3)', description: 'format' }], datasetReleaseId: 'r1' })
  expect(await (await GET(req(), ctx(['printf']))).text()).toContain('/man/printf/3.txt\n')
})

it('keeps aliases in plain text and honors distro', async () => {
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1', datasetReleaseId: 'r1' })
  const res = await GET(req('?distro=ubuntu'), ctx(['gunzip']))
  expect(res.status).toBe(308)
  expect(res.headers.get('location')).toBe('/man/gzip/1.txt?distro=ubuntu')
})

it('HEAD has the same headers and rate limit, with no body', async () => {
  const res = await HEAD(req(), ctx())
  expect(res.status).toBe(200)
  expect(res.headers.get('link')).toContain('/man/tar/1>')
  expect(await res.text()).toBe('')
  expect(isRateLimited).toHaveBeenCalledOnce()
})

it('loads tar.1.txt from the same section payload used by HTML', async () => {
  const res = await GET(req(), ctx(['tar.1']))
  expect(res.status).toBe(200)
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledExactlyOnceWith({ distro: 'debian', name: 'tar', section: '1', release: 'test' })
  expect(fetchManResolve).not.toHaveBeenCalled()
})

it('keeps security headers on denied HEAD requests even when prefetch skips the proxy', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.mocked(isRateLimited).mockResolvedValue(true)
  const request = req()
  request.headers.set('purpose', 'prefetch')
  const res = await HEAD(request, ctx())
  expect(res.status).toBe(429)
  expect(await res.text()).toBe('')
  expect(res.headers.get('content-security-policy')).toBeTruthy()
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000')
})


it('decodes Perl route parameters exactly once for text payloads and name-only redirects', async () => {
  const perl = { ...manual, page: { ...manual.page, name: 'foo::bar', section: '3pm' } }
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: perl })
  const response = await GET(req(), ctx(['foo%3A%3Abar', '3pm']))
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('FOO::BAR(3pm)')
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledWith({ distro: 'debian', name: 'foo::bar', section: '3pm', release: 'test' })
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'page', name: 'foo::bar', section: '3pm', title: '', description: '', datasetReleaseId: 'r1' })
  expect((await GET(req(), ctx(['foo%3A%3Abar']))).headers.get('location')).toBe('/man/foo%3A%3Abar/3pm.txt')
})

it.each(['foo%253A%253Abar', 'foo%ZZ'])('rejects malformed or doubly encoded text names %s', async name => {
  expect((await GET(req(), ctx([name, '3pm']))).status).toBe(404)
  expect(fetchManByNameAndSectionOrAlias).not.toHaveBeenCalled()
})

it('selects an explicit package provider and preserves it through short-route redirects', async () => {
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: { ...manual, page: { ...manual.page, indexable: false }, providers: { packages: ['tar', 'alternate'], defaultPackage: 'tar', policy: 'curated', sameAsDefault: false } } })
  const res = await GET(req('?pkg=alternate'), ctx())
  expect(res.status).toBe(200)
  expect(res.headers.get('link')).toBe('<https://betterman.sh/man/tar/1?pkg=alternate>; rel="canonical"')
  expect(res.headers.get('x-robots-tag')).toBe('noindex')
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', section: '1', pkg: 'alternate', release: 'test' })
  const redirect = await GET(req('?pkg=alternate'), ctx(['tar']))
  expect(redirect.headers.get('location')).toBe('/man/tar/1.txt?pkg=alternate')
})


it('does not share a response when the proxy release is absent or does not match', async () => {
  const untrusted = req()
  untrusted.headers.delete('x-bm-release-token')
  expect((await GET(untrusted, ctx())).headers.get('cache-control')).toBe('private, no-store')
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: { ...manual, page: { ...manual.page, datasetReleaseId: 'other' } } })
  expect((await GET(req(), ctx())).headers.get('cache-control')).toBe('private, no-store')
})


it('keeps alternate canonical and robots headers on a release-mismatched private answer', async () => {
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: {
    ...manual, page: { ...manual.page, datasetReleaseId: 'other', sourcePackage: 'alternate', indexable: false },
    providers: { packages: ['tar', 'alternate'], defaultPackage: 'tar', policy: 'curated', sameAsDefault: false },
  } })
  const res = await GET(req('?pkg=alternate'), ctx())
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(res.headers.get('link')).toBe('<https://betterman.sh/man/tar/1?pkg=alternate>; rel="canonical"')
  expect(res.headers.get('x-robots-tag')).toBe('noindex')
})

it.each([true, false, undefined])('carries tier robots on text GET and HEAD: %s', async indexable => {
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: { ...manual, page: { ...manual.page, indexable } } })
  for (const method of [GET, HEAD]) {
    const res = await method(req(), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe(indexable !== false ? 'index, follow' : 'noindex, follow')
    expect(res.headers.get('link')).toBe('<https://betterman.sh/man/tar/1>; rel="canonical"')
  }
})
