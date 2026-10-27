import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const body = JSON.stringify({ n: 'palette opened', d: 'betterman.sh', u: 'https://betterman.sh/' })
const request = (headers = {}) => new Request('https://betterman.sh/assets/entry', { method: 'POST', body, headers })

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', 'betterman.sh'))
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('forwards the trusted client IP and User-Agent but no cookies, auth or spoofed forwarding headers', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202, headers: { 'Set-Cookie': 'bad=1' } }))
  vi.stubGlobal('fetch', fetcher)
  const response = await POST(request({
    'user-agent': 'test-browser', 'x-vercel-forwarded-for': '203.0.113.1, 203.0.113.2',
    'x-forwarded-for': '192.0.2.99', cookie: 'private=1', authorization: 'private',
  }))
  expect(response.status).toBe(202)
  expect(response.headers.has('set-cookie')).toBe(false)
  const [url, init] = fetcher.mock.calls[0]
  expect(url).toBe('https://plausible.io/api/event')
  expect(Object.fromEntries(init.headers)).toEqual({
    'content-type': 'application/json', 'user-agent': 'test-browser', 'x-forwarded-for': '203.0.113.1',
  })
  expect(init.body).toBe(body)
  expect(init.cache).toBe('no-store')
})

it('does not trust a caller-supplied IP outside Vercel', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
  vi.stubGlobal('fetch', fetcher)
  await POST(request({ 'x-forwarded-for': '192.0.2.99', 'x-real-ip': '192.0.2.99' }))
  expect(fetcher.mock.calls[0][1].headers.has('x-forwarded-for')).toBe(false)
})

it('strips query, fragment, userinfo, referrer, arbitrary properties and caller-selected sites', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
  vi.stubGlobal('fetch', fetcher)
  const raw = {
    n: 'pref changed', u: 'https://private:password@betterman.sh/search?q=private&utm_term=private#private',
    d: 'other-site', r: 'https://external.test/private?private', p: { axis: 'fontSize', value: 'private', userId: 'private' },
  }
  expect((await POST(new Request('https://betterman.sh/assets/entry', { method: 'POST', body: JSON.stringify(raw) }))).status).toBe(202)
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    n: 'pref changed', d: 'betterman.sh', u: 'https://betterman.sh/search', p: { axis: 'fontSize' },
  })
})

it.each([
  '{}', 'null', 'not json', JSON.stringify({ n: 'arbitrary', u: 'https://betterman.sh/' }),
  JSON.stringify({ n: 'pref changed', u: 'https://betterman.sh/', p: { axis: 'userId' } }),
  JSON.stringify({ n: 'pageview', u: 'https://other.test/' }),
])('rejects malformed, unrecognized or cross-origin payloads: %s', async (invalid) => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const response = await POST(new Request('https://betterman.sh/assets/entry', { method: 'POST', body: invalid }))
  expect(response.status).toBe(400)
  expect(fetcher).not.toHaveBeenCalled()
})

it('discards engagement requests and rejects oversized payloads without calling upstream', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  for (const [input, status] of [[JSON.stringify({ n: 'engagement' }), 204], ['x'.repeat(4097), 413]] as const) {
    expect((await POST(new Request('https://betterman.sh/assets/entry', { method: 'POST', body: input }))).status).toBe(status)
  }
  expect(fetcher).not.toHaveBeenCalled()
})

it('makes no upstream call when unconfigured', async () => {
  vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', '')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  expect((await POST(request())).status).toBe(204)
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([() => Promise.reject(new Error('offline')), () => Promise.resolve(new Response(null, { status: 429 }))])(
  'returns an empty uncached failure', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(failure))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
  },
)
