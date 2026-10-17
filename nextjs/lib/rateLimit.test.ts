import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mutation = vi.hoisted(() => vi.fn())
vi.mock('@/lib/convexClient', () => ({ getConvexClient: () => ({ mutation }) }))

import { api as convexApi } from '../../convex/_generated/api'

import { isRateLimited, requestIdentifier } from './rateLimit'

beforeEach(() => {
  mutation.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

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
  it('signs the identifier with HMAC-SHA256 under RATE_LIMIT_TAG_KEY', async () => {
    // RFC 4231 test case 2; convex/rateLimit.test.ts verifies the same vector.
    vi.stubEnv('RATE_LIMIT_TAG_KEY', 'Jefe')
    mutation.mockResolvedValue({ allowed: true })

    const headers = new Headers({ 'x-vercel-forwarded-for': 'what do ya want for nothing?' })
    expect(await isRateLimited(headers, 'search')).toBe(false)
    expect(mutation).toHaveBeenCalledWith(convexApi.rateLimit.consume, {
      kind: 'search',
      identifier: 'what do ya want for nothing?',
      tag: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    })
  })

  it('fails closed without calling Convex when the key is missing', async () => {
    vi.stubEnv('RATE_LIMIT_TAG_KEY', '')

    expect(await isRateLimited(new Headers(), 'page')).toBe(true)
    expect(mutation).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[rate-limit] RATE_LIMIT_TAG_KEY is not configured')
  })

  it('fails closed without logging the Convex error when enforcement throws', async () => {
    vi.stubEnv('RATE_LIMIT_TAG_KEY', 'key')
    mutation.mockRejectedValue(new Error('RATE_LIMIT_TAG_INVALID: identifier=203.0.113.10'))

    expect(await isRateLimited(new Headers({ 'x-vercel-forwarded-for': '203.0.113.10' }), 'page')).toBe(true)
    expect(vi.mocked(console.error).mock.calls).toEqual([['[rate-limit] enforcement failed']])
  })
})
