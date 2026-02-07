/* BetterMan service worker (minimal, no Workbox). */

const CACHE_VERSION = 'v0.5.0'
const CACHE_PREFIX = 'bm'

const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`
const HTML_CACHE = `${CACHE_PREFIX}-html-${CACHE_VERSION}`
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`

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

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      await cache.put(request, res.clone())
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

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const res = await fetch(request)
  if (res && res.ok) {
    await cache.put(request, res.clone())
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, HTML_CACHE))
    return
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }
})
