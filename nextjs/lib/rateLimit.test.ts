import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mutation = vi.hoisted(() => vi.fn())
const getConvexClient = vi.hoisted(() => vi.fn(() => ({ mutation })))
vi.mock('@/lib/convexClient', () => ({ getConvexClient }))

import { isRateLimited, requestIdentifier } from './rateLimit'

beforeEach(() => {
  vi.stubEnv('RATE_LIMIT_TAG_KEY', 'Jefe')
  vi.stubEnv('BETTERMAN_RATE_LIMIT_DEV_BYPASS', undefined)
  vi.stubEnv('NODE_ENV', 'test')
  getConvexClient.mockClear()
  mutation.mockReset()
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
  it('sends an HMAC-SHA256 tag for the trusted identifier', async () => {
    mutation.mockResolvedValue({ allowed: true })
    const headers = new Headers({ 'x-vercel-forwarded-for': 'what do ya want for nothing?' })

    expect(await isRateLimited(headers, 'search')).toBe(false)
    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      kind: 'search', identifier: 'what do ya want for nothing?',
      tag: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    })
  })

  it('returns limited when Convex rejects the authenticated request', async () => {
    mutation.mockResolvedValue({ allowed: false })
    expect(await isRateLimited(new Headers(), 'page')).toBe(true)
  })

  it.each([undefined, '', '   '])('fails closed when the tag key is unset or blank', async (key) => {
    vi.stubEnv('RATE_LIMIT_TAG_KEY', key)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await isRateLimited(new Headers(), 'search')).toBe(true)
    expect(getConvexClient).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('[rate-limit] RATE_LIMIT_TAG_KEY is not configured')
  })

  it.each(['RATE_LIMIT_TAG_INVALID', 'RATE_LIMIT_TAG_KEY_NOT_CONFIGURED', 'network failed'])(
    'fails closed and sanitizes Convex errors: %s', async (code) => {
      mutation.mockRejectedValue(new Error(`${code}: identifier=private-client tag=private-tag key=private-key`))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(await isRateLimited(new Headers(), 'search')).toBe(true)
      expect(error).toHaveBeenCalledExactlyOnceWith('[rate-limit] enforcement failed')
    },
  )

  it('fails closed if constructing the Convex client fails', async () => {
    getConvexClient.mockImplementationOnce(() => { throw new Error('private configuration') })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isRateLimited(new Headers(), 'page')).toBe(true)
    expect(error).toHaveBeenCalledExactlyOnceWith('[rate-limit] enforcement failed')
  })

  it('allows an explicit development bypass only without a key', async () => {
    vi.stubEnv('RATE_LIMIT_TAG_KEY', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BETTERMAN_RATE_LIMIT_DEV_BYPASS', '1')
    expect(await isRateLimited(new Headers(), 'search')).toBe(false)
    expect(getConvexClient).not.toHaveBeenCalled()

    vi.stubEnv('RATE_LIMIT_TAG_KEY', 'Jefe')
    mutation.mockResolvedValue({ allowed: false })
    expect(await isRateLimited(new Headers(), 'search')).toBe(true)
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('ignores the development bypass in production', async () => {
    vi.stubEnv('RATE_LIMIT_TAG_KEY', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BETTERMAN_RATE_LIMIT_DEV_BYPASS', '1')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isRateLimited(new Headers(), 'search')).toBe(true)
    expect(getConvexClient).not.toHaveBeenCalled()
  })
})
