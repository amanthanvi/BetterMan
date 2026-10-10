import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isRateLimited, requestIdentifier } from './rateLimit'

describe('requestIdentifier', () => {
  it('ignores spoofable forwarding headers', () => {
    expect(
      requestIdentifier(
        new Headers({
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3',
        }),
      ),
    ).toBe('anonymous')
  })

  it('uses the leftmost Vercel-overwritten client address', () => {
    expect(requestIdentifier(new Headers({ 'x-vercel-forwarded-for': ' 9.9.9.9, 10.0.0.1 ' }))).toBe('9.9.9.9')
  })
})

describe('isRateLimited', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://happy-otter-123.convex.cloud')
    vi.stubEnv('CONVEX_SITE_URL', '')
    vi.stubEnv('CONVEX_RATE_LIMIT_SECRET', ' rl-secret ')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('asks the secret-gated Convex HTTP action, not a public mutation', async () => {
    fetchMock.mockResolvedValue(Response.json({ allowed: true, count: 1, retryAfterSeconds: 30 }))

    await expect(isRateLimited(new Headers({ 'x-vercel-forwarded-for': '203.0.113.10' }), 'search')).resolves.toBe(false)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://happy-otter-123.convex.site/rate-limit/enforce')
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer rl-secret')
    expect(JSON.parse(String(init?.body))).toEqual({ kind: 'search', identifier: '203.0.113.10' })
  })

  it('reports a limited caller', async () => {
    fetchMock.mockResolvedValue(Response.json({ allowed: false, count: 61, retryAfterSeconds: 12 }))
    await expect(isRateLimited(new Headers(), 'page')).resolves.toBe(true)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ kind: 'page', identifier: 'anonymous' })
  })

  it('refuses to call Convex without the shared secret', async () => {
    vi.stubEnv('CONVEX_RATE_LIMIT_SECRET', ' ')
    await expect(isRateLimited(new Headers(), 'search')).rejects.toThrow('CONVEX_RATE_LIMIT_SECRET is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a rejected secret', new Response(null, { status: 401 })],
    ['an unconfigured deployment', new Response(null, { status: 503 })],
    ['a response without a decision', Response.json({ error: 'nope' })],
  ])('fails instead of allowing on %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response)
    await expect(isRateLimited(new Headers(), 'search')).rejects.toThrow('Convex rate limit check')
  })
})
