import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

import { config, proxy } from './proxy'
import { isRateLimited } from './lib/rateLimit'

vi.mock('./lib/rateLimit', () => ({ isRateLimited: vi.fn() }))
beforeEach(() => vi.mocked(isRateLimited).mockReset().mockResolvedValue(false))

it.each(['/api', '/api/v1/info', '/api/v1/man/tar/1'])('skips API routes: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
})

it.each(['/', '/apiary', '/api-docs', '/man/api/3', '/tar', '/tar.1', '/2/open', '/tar/-x', '/opensearch.xml'])('sets CSP on pages: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
})

it.each(['/man/tar', '/man/tar/1', '/man/tar.txt', '/man/tar.TXT'])('rate limits manual HTML before rendering: %s', async (path) => {
  vi.mocked(isRateLimited).mockResolvedValue(true)
  const request = new NextRequest(`https://betterman.sh${path}`)
  const res = await proxy(request)
  expect(res.status).toBe(429)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(await res.text()).toBe('Too many requests\n')
  expect(isRateLimited).toHaveBeenCalledWith(request.headers, 'page')
})

it('limits HEAD without a body', async () => {
  vi.mocked(isRateLimited).mockResolvedValue(true)
  const res = await proxy(new NextRequest('https://betterman.sh/man/tar/1', { method: 'HEAD' }))
  expect(res.status).toBe(429)
  expect(await res.text()).toBe('')
})

it.each(['/man/tar/1.txt', '/man/tar/1/og', '/tar.txt', '/search'])('leaves route-owned limits alone: %s', async (path) => {
  await proxy(new NextRequest(`https://betterman.sh${path}`))
  expect(isRateLimited).not.toHaveBeenCalled()
})

it('cannot bypass the HTML page limit using prefetch headers', () => {
  expect(unstable_doesMiddlewareMatch({ config, url: '/man/tar/1', headers: { purpose: 'prefetch', 'next-router-prefetch': '1' } })).toBe(true)
})

it.each(['GET', 'HEAD'])('limits %s name-only .txt HTML routes even with prefetch headers', async (method) => {
  vi.mocked(isRateLimited).mockResolvedValue(true)
  for (const path of ['/man/tar.txt', '/man/tar.TXT']) {
    const headers = { purpose: 'prefetch', 'next-router-prefetch': '1' }
    expect(unstable_doesMiddlewareMatch({ config, url: path, headers })).toBe(true)
    const res = await proxy(new NextRequest(`https://betterman.sh${path}`, { method, headers }))
    expect(res.status).toBe(429)
    if (method === 'HEAD') expect(await res.text()).toBe('')
  }
})
