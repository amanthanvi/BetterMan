import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://betterman.test'
const version = 'v0.6.5-pwa-1'
const htmlName = `bm-html-${version}`
const offlineName = `bm-offline-${version}`

function context(distro = '', theme = '') {
  return encodeURIComponent(JSON.stringify([distro, theme]))
}

function htmlKey(path: string, variant = context()) {
  const url = new URL(path, origin)
  url.searchParams.append('__bm_navigation_context', variant)
  return url.href
}

type CacheKey = string | { url: string }

function keyOf(key: CacheKey) {
  return typeof key === 'string' ? new URL(key, origin).href : key.url
}

function makeCache() {
  const entries = new Map<string, Response>()
  return {
    entries,
    match: vi.fn(async (key: CacheKey) => entries.get(keyOf(key))?.clone()),
    put: vi.fn(async (key: CacheKey, response: Response) => {
      entries.set(keyOf(key), response.clone())
    }),
    keys: vi.fn(async () => [...entries.keys()]),
    delete: vi.fn(async (key: CacheKey) => entries.delete(keyOf(key))),
  }
}

function worker(stores = new Map<string, ReturnType<typeof makeCache>>(), cookieStoreSupported = true) {
  const preferences = new Map<string, string>()
  const getCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, makeCache())
    return stores.get(name)!
  }
  const caches = {
    open: vi.fn(async (name: string) => getCache(name)),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  }
  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    location: { origin },
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    ...(cookieStoreSupported ? { cookieStore: { get: async (name: string) => preferences.has(name) ? { value: preferences.get(name)! } : undefined } } : {}),
  }
  const fetch = vi.fn<(request: { url: string }) => Promise<Response>>()
  runInNewContext(source, { self, caches, Response, Request, URL, fetch: (request: { url: string }) => {
    const servedContext = context(preferences.get('bm-distro'), preferences.get('bm-theme-resolved'))
    return fetch(request).then(response => {
      if (!response.headers.has('X-BM-Navigation-Context')) response.headers.set('X-BM-Navigation-Context', servedContext)
      return response
    })
  } })

  function request(path: string, mode = 'navigate', destination = '') {
    let response: Promise<Response> | undefined
    const pending: Promise<unknown>[] = []
    const event = {
      request: { url: new URL(path, origin).href, method: 'GET', mode, destination, headers: new Headers() },
      respondWith: (value: Promise<Response>) => { response = value },
      waitUntil: (value: Promise<unknown>) => { pending.push(value) },
    }
    listeners.get('fetch')!(event)
    return { response, pending }
  }

  async function lifecycle(name: string) {
    const pending: Promise<unknown>[] = []
    listeners.get(name)!({ waitUntil: (value: Promise<unknown>) => pending.push(value) })
    await Promise.all(pending)
  }

  return { stores, getCache, caches, self, fetch, request, lifecycle, preferences }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('service worker navigation freshness', () => {
  it('serves cached HTML before the network completes and keeps refresh alive', async () => {
    const w = worker()
    const cache = w.getCache(htmlName)
    await cache.put(htmlKey('/man/ls/1'), new Response('cached'))
    const network = deferred<Response>()
    w.fetch.mockReturnValue(network.promise)
    const event = w.request('/man/ls/1')
    expect(event.pending).toHaveLength(1)
    expect(await (await event.response!).text()).toBe('cached')
    network.resolve(new Response('fresh'))
    await Promise.all(event.pending)
    expect(await (await cache.match(htmlKey('/man/ls/1')))!.text()).toBe('fresh')
  })

  it('keeps cached HTML when background fetch fails', async () => {
    const w = worker()
    await w.getCache(htmlName).put(htmlKey('/'), new Response('cached'))
    w.fetch.mockRejectedValue(new Error('offline'))
    const event = w.request('/')
    expect(await (await event.response!).text()).toBe('cached')
    await Promise.all(event.pending)
  })

  it('does not replace cached HTML with HTTP errors', async () => {
    const w = worker()
    const cache = w.getCache(htmlName)
    await cache.put(htmlKey('/'), new Response('cached'))
    w.fetch.mockResolvedValue(new Response('server error', { status: 500 }))
    const event = w.request('/')
    expect(await (await event.response!).text()).toBe('cached')
    await Promise.all(event.pending)
    expect(await (await cache.match(htmlKey('/')))!.text()).toBe('cached')
  })

  it('fetches and caches an uncached navigation', async () => {
    const w = worker()
    w.fetch.mockResolvedValue(new Response('fresh'))
    const event = w.request('/search?q=ls')
    expect(await (await event.response!).text()).toBe('fresh')
    await Promise.all(event.pending)
    expect(await (await w.getCache(htmlName).match(htmlKey('/search?q=ls')))!.text()).toBe('fresh')
  })

  it('returns an HTTP error on a cache miss without caching it as success', async () => {
    const w = worker()
    w.fetch.mockResolvedValue(new Response('missing', { status: 404 }))
    const event = w.request('/missing')
    expect((await event.response!).status).toBe(404)
    expect(w.getCache(htmlName).entries.size).toBe(0)
  })

  it('precaches a self-contained branded 503 offline page before skipWaiting', async () => {
    const w = worker()
    await w.lifecycle('install')
    const fallback = await w.getCache(offlineName).match('/__bm-offline')
    expect(fallback!.status).toBe(503)
    expect(fallback!.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(fallback!.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    const html = await fallback!.text()
    expect(html).toContain('BETTERMAN(1)')
    expect(html).toContain("Offline — this page isn't cached")
    expect(html).toContain('<a href="/">Go home</a>')
    expect(html).not.toMatch(/<script|<link|Geist|border-radius/)
    expect(w.self.skipWaiting).toHaveBeenCalledOnce()
    expect(w.getCache(offlineName).put.mock.invocationCallOrder[0]).toBeLessThan(w.self.skipWaiting.mock.invocationCallOrder[0])
    w.fetch.mockRejectedValue(new Error('offline'))
    const event = w.request('/uncached')
    expect(await (await event.response!).text()).toBe(html)
  })

  it('still serves the inline fallback when storage is unavailable', async () => {
    const w = worker()
    w.caches.open.mockRejectedValue(new Error('storage unavailable'))
    w.fetch.mockRejectedValue(new Error('offline'))
    const event = w.request('/uncached')
    expect((await event.response!).status).toBe(503)
    expect(await (await event.response!).text()).toContain('BETTERMAN(1)')
    await Promise.all(event.pending)
  })

  it('uses the network if reading the cache fails', async () => {
    const w = worker()
    w.getCache(htmlName).match.mockRejectedValue(new Error('cache read failed'))
    w.fetch.mockResolvedValue(new Response('fresh'))
    const event = w.request('/')
    expect(await (await event.response!).text()).toBe('fresh')
  })

  it('returns successful network HTML even if a quota error prevents caching', async () => {
    const w = worker()
    w.getCache(htmlName).put.mockRejectedValue(new Error('quota exceeded'))
    w.fetch.mockResolvedValue(new Response('fresh'))
    const event = w.request('/')
    expect(await (await event.response!).text()).toBe('fresh')
    await Promise.all(event.pending)
  })

  it('leaves cross-origin navigations to the browser', () => {
    const w = worker()
    expect(w.request('https://elsewhere.test/').response).toBeUndefined()
    expect(w.fetch).not.toHaveBeenCalled()
  })

  it('does not serve a different distro or theme variant at the same URL', async () => {
    const w = worker()
    const cache = w.getCache(htmlName)
    await cache.put(htmlKey('/man/ls/1', context('debian', 'light')), new Response('Debian light'))
    await cache.put(htmlKey('/man/ls/1', context('ubuntu', 'dark')), new Response('Ubuntu dark'))
    w.preferences.set('bm-distro', 'ubuntu')
    w.preferences.set('bm-theme-resolved', 'dark')
    const network = deferred<Response>()
    w.fetch.mockReturnValue(network.promise)
    const event = w.request('/man/ls/1')
    expect(await (await event.response!).text()).toBe('Ubuntu dark')
    network.resolve(new Response('fresh Ubuntu dark'))
    await Promise.all(event.pending)
    expect(await (await cache.match(htmlKey('/man/ls/1', context('debian', 'light'))))!.text()).toBe('Debian light')
  })

  it('waits for network when only a mismatched preference variant is cached', async () => {
    const w = worker()
    await w.getCache(htmlName).put(htmlKey('/man/ls/1', context('debian')), new Response('Debian'))
    w.preferences.set('bm-distro', 'ubuntu')
    w.fetch.mockResolvedValue(new Response('Ubuntu'))
    const event = w.request('/man/ls/1')
    expect(await (await event.response!).text()).toBe('Ubuntu')
  })

  it('stores HTML under the server-reported context even if preferences change in flight', async () => {
    const w = worker()
    w.preferences.set('bm-distro', 'ubuntu')
    w.fetch.mockResolvedValue(new Response('Debian', { headers: { 'X-BM-Navigation-Context': context('debian') } }))
    await w.request('/man/ls/1').response
    const cache = w.getCache(htmlName)
    expect(await cache.match(htmlKey('/man/ls/1', context('ubuntu')))).toBeUndefined()
    expect(await (await cache.match(htmlKey('/man/ls/1', context('debian'))))!.text()).toBe('Debian')
  })

  it('uses network-first without Cookie Store, retaining offline cached HTML as a final fallback', async () => {
    const w = worker(undefined, false)
    await w.getCache(htmlName).put('/man/ls/1', new Response('old'))
    w.fetch.mockResolvedValue(new Response('fresh'))
    expect(await (await w.request('/man/ls/1').response!).text()).toBe('fresh')
    w.fetch.mockRejectedValue(new Error('offline'))
    expect(await (await w.request('/man/ls/1').response!).text()).toBe('fresh')
  })
})

describe('service worker cache maintenance', () => {
  it('trims on activation, removes old BetterMan caches, and preserves other caches and offline UI', async () => {
    const w = worker()
    await w.lifecycle('install')
    w.getCache('bm-html-old')
    w.getCache('other-app-cache')
    const cache = w.getCache(htmlName)
    for (let i = 0; i < 85; i += 1) await cache.put(`/page-${i}`, new Response('cached'))
    await w.lifecycle('activate')
    expect(w.stores.has('bm-html-old')).toBe(false)
    expect(w.stores.has('other-app-cache')).toBe(true)
    expect(w.stores.has(offlineName)).toBe(true)
    expect(cache.entries.size).toBe(80)
    expect(await cache.match('/page-0')).toBeUndefined()
    expect(w.self.clients.claim).toHaveBeenCalledOnce()
  })

  it('enumerates each cache only every 20 successful writes', async () => {
    const w = worker()
    w.fetch.mockImplementation(async () => new Response('fresh'))
    const cache = w.getCache(htmlName)
    for (let i = 0; i < 85; i += 1) await cache.put(`/old-${i}`, new Response('cached'))
    for (let i = 1; i <= 40; i += 1) {
      const event = w.request(`/new-${i}`)
      await event.response
      await Promise.all(event.pending)
      expect(cache.keys).toHaveBeenCalledTimes(Math.floor(i / 20))
    }
    expect(cache.entries.size).toBe(80)
  })

  it('persists trim cadence through worker restarts without another activation', async () => {
    let w = worker()
    const cache = w.getCache(htmlName)
    for (let i = 0; i < 80; i += 1) await cache.put(`/old-${i}`, new Response('cached'))
    for (let i = 1; i <= 20; i += 1) {
      w = worker(w.stores)
      w.fetch.mockResolvedValue(new Response('fresh'))
      const event = w.request(`/new-${i}`)
      await event.response
      await Promise.all(event.pending)
      expect(cache.keys).toHaveBeenCalledTimes(Math.floor(i / 20))
    }
    expect(cache.entries.size).toBe(80)
  })

  it('serializes simultaneous writes so persistent counters do not lose increments', async () => {
    const w = worker()
    w.fetch.mockImplementation(async () => new Response('fresh'))
    const events = Array.from({ length: 40 }, (_, i) => w.request(`/new-${i}`))
    await Promise.all(events.flatMap(event => [event.response, ...event.pending]))
    expect(w.getCache(htmlName).keys).toHaveBeenCalledTimes(2)
  })

  it('keeps APIs network-first and static assets cache-first', async () => {
    const w = worker()
    await w.getCache(`bm-api-${version}`).put('/api/v1/info', new Response('cached API'))
    w.fetch.mockResolvedValue(new Response('fresh API'))
    expect(await (await w.request('/api/v1/info', 'cors').response!).text()).toBe('fresh API')
    w.fetch.mockRejectedValue(new Error('offline'))
    expect(await (await w.request('/api/v1/info', 'cors').response!).text()).toBe('fresh API')
    await w.getCache(`bm-static-${version}`).put('/_next/static/chunk.js', new Response('cached JS'))
    w.fetch.mockClear()
    expect(await (await w.request('/_next/static/chunk.js', 'cors', 'script').response!).text()).toBe('cached JS')
    expect(w.fetch).not.toHaveBeenCalled()
  })
})
