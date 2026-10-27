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
const req = (query = '') => new Request(`https://betterman.sh/man/tar/1.txt${query}`, { headers: { 'x-vercel-forwarded-for': '192.0.2.1' } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
  vi.mocked(isRateLimited).mockResolvedValue(false)
  vi.mocked(fetchManByNameAndSectionOrAlias).mockResolvedValue({ kind: 'page', data: manual })
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'page', name: 'tar', section: '1', title: 'tar(1)', description: 'archive' })
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
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledExactlyOnceWith({ distro: 'ubuntu', name: 'tar', section: '1' })
  expect(fetchManResolve).not.toHaveBeenCalled()
})

it('resolves the short form to the HTML section cache and ignores browser distro cookies', async () => {
  const request = req()
  request.headers.set('cookie', 'bm-distro=ubuntu')
  const res = await GET(request, ctx(['TAR']))
  expect(res.status).toBe(308)
  expect(res.headers.get('location')).toBe('/man/tar/1.txt')
  expect(fetchManResolve).toHaveBeenCalledExactlyOnceWith({ distro: 'debian', name: 'tar' })
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
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenLastCalledWith({ distro: 'debian', name: 'tar', section: '1' })
})

it('offers explicit text URLs for ambiguous names', async () => {
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'ambiguous', options: [{ section: '3', title: 'printf(3)', description: 'format' }] })
  const res = await GET(req('?distro=ubuntu'), ctx(['printf']))
  expect(res.status).toBe(409)
  expect(await res.text()).toContain('/man/printf/3.txt?distro=ubuntu')
})

it('keeps only the request distro in redirects and choices, Debian included, after a fallback', async () => {
  vi.mocked(fetchManResolve).mockRejectedValueOnce(new FastApiError(404, 'RELEASE_NOT_FOUND', 'Missing'))
    .mockResolvedValueOnce({ kind: 'alias', name: 'gzip', section: '1' })
  const fallback = await GET(req('?distro=arch'), ctx(['gunzip']))
  expect(fallback.headers.get('location')).toBe('/man/gzip/1.txt?distro=arch')

  const explicitDebian = await GET(req('?distro=debian'), ctx(['TAR']))
  expect(explicitDebian.headers.get('location')).toBe('/man/tar/1.txt?distro=debian')

  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'ambiguous', options: [{ section: '3', title: 'printf(3)', description: 'format' }] })
  expect(await (await GET(req(), ctx(['printf']))).text()).toContain('/man/printf/3.txt\n')
})

it('keeps aliases in plain text and honors distro', async () => {
  vi.mocked(fetchManResolve).mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1' })
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
  expect(fetchManByNameAndSectionOrAlias).toHaveBeenCalledExactlyOnceWith({ distro: 'debian', name: 'tar', section: '1' })
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
