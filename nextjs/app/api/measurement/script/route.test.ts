import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'

afterEach(() => vi.unstubAllGlobals())

it('fetches the custom-event tracker without forwarding any browser headers', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('/* tracker */'))
  vi.stubGlobal('fetch', fetcher)
  const response = await GET()
  expect(await response.text()).toBe('/* tracker */')
  expect(fetcher).toHaveBeenCalledWith('https://plausible.io/js/script.js', {
    next: { revalidate: 86400 }, signal: expect.any(AbortSignal),
  })
  expect(response.headers.get('content-type')).toBe('application/javascript')
  expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
  expect(response.headers.has('set-cookie')).toBe(false)
})

it.each([() => Promise.reject(new Error('offline')), () => Promise.resolve(new Response(null, { status: 503 }))])(
  'does not cache an upstream failure', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(failure))
    const response = await GET()
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('no-store')
  },
)
