import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConvexError } from 'convex/values'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ query: vi.fn(), limited: vi.fn() }))
vi.mock('@/lib/convexClient', () => ({ getConvexClient: () => ({ query: mocks.query }) }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: mocks.limited }))
import { GET } from './route'
const request = (query: string) => new NextRequest(`http://localhost/api/v1/explain?${query}`)
beforeEach(() => { vi.resetAllMocks(); mocks.limited.mockResolvedValue(false); mocks.query.mockResolvedValue({ version: 1, stages: [] }) })
describe('explain HTTP contract', () => {
  it('passes literal shell text and distro, with no shared caching', async () => {
    const cmd = 'echo $(touch /tmp/never-executed)'
    const response = await GET(request(new URLSearchParams({ cmd, distro: 'freebsd' }).toString()))
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), { cmd, distro: 'freebsd' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it.each(['cmd=', 'cmd=ls&distro=nope', new URLSearchParams({ cmd: 'x'.repeat(4097) }).toString()])('rejects invalid input before rate limiting: %s', async query => {
    expect((await GET(request(query))).status).toBe(400)
    expect(mocks.limited).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each(['EXPLAIN_INPUT_TOO_LONG','EXPLAIN_TOO_MANY_TOKENS','EXPLAIN_TOO_MANY_STAGES','EXPLAIN_TOO_DEEP'])('maps typed %s failures to 400', async code => {
    mocks.query.mockRejectedValue(new ConvexError({code}))
    const response = await GET(request('cmd=ls'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({code})
  })
  it('uses the search limiter and handles failure without exposing input', async () => {
    mocks.limited.mockResolvedValue(true)
    expect((await GET(request('cmd=ls'))).status).toBe(429)
    expect(mocks.query).not.toHaveBeenCalled()
    mocks.limited.mockResolvedValue(false)
    mocks.query.mockRejectedValue(new ConvexError({code: 'EXPLAIN_TOO_MANY_TOKENS'}))
    expect((await GET(request('cmd=ls'))).status).toBe(400)
    mocks.query.mockRejectedValue(new Error('EXPLAIN_TOO_MANY_TOKENS'))
    expect((await GET(request('cmd=ls'))).status).toBe(503)
    mocks.query.mockRejectedValue(new Error('private details'))
    const response = await GET(request('cmd=ls'))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private details')
  })
})
