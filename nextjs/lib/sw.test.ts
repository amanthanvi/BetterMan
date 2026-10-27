import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://betterman.test'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => { resolve = res })
  return { promise, resolve }
}

function worker() {
  const entries = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (request: { url: string }) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: { url: string }, response: Response) => { entries.set(request.url, response) }),
    keys: vi.fn(async () => [...entries.keys()]),
    delete: vi.fn(async (url: string) => entries.delete(new URL(url, origin).href)),
  }
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async (): Promise<string[]> => []), delete: vi.fn() }
  const fetch = vi.fn<(request: { url: string }) => Promise<Response>>()
  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    location: { origin },
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    clients: { claim: vi.fn(async () => undefined) },
  }
  runInNewContext(source, { self, caches, fetch, Response, URL })

  function request(path: string, mode = 'navigate', destination = '') {
    let response!: Promise<Response>
    const pending: Promise<unknown>[] = []
    listeners.get('fetch')!({
      request: { url: new URL(path, origin).href, method: 'GET', mode, destination },
      respondWith: (value: Promise<Response>) => { response = value },
      waitUntil: (value: Promise<unknown>) => { pending.push(value) },
    })
    return { response, pending }
  }

  async function activate() {
    const pending: Promise<unknown>[] = []
    listeners.get('activate')!({ waitUntil: (value: Promise<unknown>) => { pending.push(value) } })
    await Promise.all(pending)
  }

  return { entries, cache, caches, fetch, self, request, activate }
}

describe('service worker', () => {
  it('leaves the unhashed tracker to HTTP caching', () => {
    const w = worker()
    const request = w.request('/assets/site.js', 'cors', 'script')
    expect(request.response).toBeUndefined()
    expect(w.cache.match).not.toHaveBeenCalled()
    expect(w.fetch).not.toHaveBeenCalled()
  })

  it('removes the tracker from an existing static cache on upgrade', async () => {
    const w = worker()
    // The currently retained cache name must also be cleaned, not just old versioned caches.
    const sourceVersion = /const CACHE_VERSION = '([^']+)'/.exec(source)![1]
    const cacheName = `bm-static-${sourceVersion}`
    w.caches.keys.mockResolvedValue([cacheName])
    w.entries.set(`${origin}/assets/site.js`, new Response('old tracker'))
    await w.activate()
    expect(w.cache.delete).toHaveBeenCalledWith('/assets/site.js')
    expect(w.entries.has(`${origin}/assets/site.js`)).toBe(false)
  })

  it('responds without waiting for a slow cache write', async () => {
    const w = worker()
    const slowWrite = deferred()
    w.cache.put.mockImplementationOnce(async (request, response) => {
      await slowWrite.promise
      w.entries.set(request.url, response)
    })
    w.fetch.mockImplementation(async (request) => new Response(new URL(request.url).pathname))

    const slow = w.request('/man/ls/1')
    expect(await (await slow.response).text()).toBe('/man/ls/1')
    const other = w.request('/man/tar/1')
    expect(await (await other.response).text()).toBe('/man/tar/1')
    expect(w.entries.has(`${origin}/man/ls/1`)).toBe(false)

    slowWrite.resolve()
    await Promise.all([...slow.pending, ...other.pending])
    expect(w.entries.has(`${origin}/man/ls/1`)).toBe(true)
    expect(w.entries.has(`${origin}/man/tar/1`)).toBe(true)
  })

  it('serves an inline offline page for an uncached navigation', async () => {
    const w = worker()
    w.fetch.mockRejectedValue(new TypeError('offline'))

    const res = await w.request('/man/ls/1').response
    const html = await res.text()
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(html).toContain('BETTERMAN(1)')
    expect(html).toContain('<a href="/">')
    expect(html).not.toMatch(/<script|<link|src=/i)
  })

  it('prefers a cached copy when the network fails', async () => {
    const w = worker()
    w.entries.set(`${origin}/man/ls/1`, new Response('cached'))
    w.fetch.mockRejectedValue(new TypeError('offline'))

    expect(await (await w.request('/man/ls/1').response).text()).toBe('cached')
  })

  it('still activates when trimming caches fails', async () => {
    const w = worker()
    w.cache.keys.mockRejectedValue(new Error('storage unavailable'))

    await w.activate()
    expect(w.self.clients.claim).toHaveBeenCalled()
  })
})
