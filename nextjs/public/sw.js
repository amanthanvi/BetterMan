/* BetterMan service worker (minimal, no Workbox). */

const CACHE_VERSION = 'v0.6.3'
const CACHE_PREFIX = 'bm'

const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`
const HTML_CACHE = `${CACHE_PREFIX}-html-${CACHE_VERSION}`
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`

const MAX_STATIC_ENTRIES = 200
const MAX_HTML_ENTRIES = 80
const MAX_API_ENTRIES = 200

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((key) => {
          if (!key.startsWith(`${CACHE_PREFIX}-`)) return Promise.resolve()
          if ([STATIC_CACHE, HTML_CACHE, API_CACHE].includes(key)) return Promise.resolve()
          return caches.delete(key)
        }),
      )
      await self.clients.claim()
    })(),
  )
})

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isApiRequest(url) {
  return isSameOrigin(url) && url.pathname.startsWith('/api/')
}

function isNextAsset(url) {
  return isSameOrigin(url) && url.pathname.startsWith('/_next/')
}

function isStaticAsset(request, url) {
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    isNextAsset(url)
  )
}

async function trimCache(cache, maxEntries) {
  if (!maxEntries) return
  const keys = await cache.keys()
  const extra = keys.length - maxEntries
  if (extra <= 0) return
  for (let i = 0; i < extra; i += 1) {
    await cache.delete(keys[i])
  }
}

async function networkFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      await cache.put(request, res.clone())
      await trimCache(cache, maxEntries)
    }
    return res
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const res = await fetch(request)
  if (res && res.ok) {
    await cache.put(request, res.clone())
    await trimCache(cache, maxEntries)
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, HTML_CACHE, MAX_HTML_ENTRIES))
    return
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE, MAX_API_ENTRIES))
    return
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, MAX_STATIC_ENTRIES))
    return
  }
})
