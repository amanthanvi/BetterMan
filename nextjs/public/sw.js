/* BetterMan service worker (minimal, no Workbox). */

const CACHE_VERSION = 'v0.6.5-pwa-1'
const CACHE_PREFIX = 'bm'

const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`
const HTML_CACHE = `${CACHE_PREFIX}-html-${CACHE_VERSION}`
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`
const OFFLINE_CACHE = `${CACHE_PREFIX}-offline-${CACHE_VERSION}`
const OFFLINE_URL = '/__bm-offline'

const MAX_STATIC_ENTRIES = 200
const MAX_HTML_ENTRIES = 80
const MAX_API_ENTRIES = 200
const TRIM_EVERY_WRITES = 20
// Serialize per-cache writes so the persistent cadence survives idle worker restarts.
const cacheWrites = new Map()

// Self-contained: the final navigation fallback must not need CSS, fonts, or JS.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — BetterMan</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; background: #faf8f5; color: #1c1a17; font: 15px/1.65 system-ui, sans-serif; }
main { max-width: 48rem; margin: 0 auto; padding: 3rem 1.5rem; }
header { padding-bottom: .75rem; border-bottom: 1px solid #cfc8bc; font: 600 13px/1.5 ui-monospace, monospace; }
h1 { margin: 2.5rem 0 1rem; font-size: 1rem; font-weight: 400; }
a { color: #c22126; font-family: ui-monospace, monospace; text-underline-offset: .25em; }
a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  body { background: #0b0b0d; color: #ededf0; }
  header { border-color: #3a3a42; }
  a { color: #e5484d; }
}
</style>
</head>
<body><main>
<header>BETTERMAN(1)</header>
<h1>Offline — this page isn't cached</h1>
<a href="/">Go home</a>
</main></body>
</html>`

function offlinePage() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      await cache.put(OFFLINE_URL, offlinePage())
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((key) => {
          if (!key.startsWith(`${CACHE_PREFIX}-`)) return Promise.resolve()
          if ([STATIC_CACHE, HTML_CACHE, API_CACHE, OFFLINE_CACHE].includes(key)) return Promise.resolve()
          return caches.delete(key)
        }),
      )
      await Promise.all(
        [[STATIC_CACHE, MAX_STATIC_ENTRIES], [HTML_CACHE, MAX_HTML_ENTRIES], [API_CACHE, MAX_API_ENTRIES]]
          .map(async ([name, max]) => trimCache(await caches.open(name), max)),
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

async function writeCache(cache, cacheName, request, response, maxEntries) {
  const write = (cacheWrites.get(cacheName) ?? Promise.resolve()).then(async () => {
    await cache.put(request, response.clone())
    // Three tiny counters live beside the offline page, outside the trimmed caches.
    const metadata = await caches.open(OFFLINE_CACHE)
    const key = `/__bm-cache-writes/${cacheName}`
    const previous = await metadata.match(key)
    const count = previous ? Number(await previous.text()) : 0
    const writes = (Number.isInteger(count) && count >= 0 ? count : 0) + 1
    await metadata.put(key, new Response(String(writes % TRIM_EVERY_WRITES)))
    if (writes % TRIM_EVERY_WRITES === 0) await trimCache(cache, maxEntries)
  }).catch(() => {
    // Cache/quota failures must not turn a successful network response into offline UI.
  })
  cacheWrites.set(cacheName, write)
  await write
}

function navigationKey(request, context) {
  const url = new URL(request.url)
  url.searchParams.append('__bm_navigation_context', context)
  return new Request(url, { headers: request.headers })
}

async function currentNavigationContext() {
  // Cookie Store is available in modern secure-context service workers. If absent,
  // keep network-first navigation: URL-only HTML cannot safely identify preferences.
  if (!self.cookieStore) return null
  try {
    const values = await Promise.all(['bm-distro', 'bm-theme-resolved'].map(async (name) => {
      const cookie = await self.cookieStore.get(name)
      return cookie ? decodeURIComponent(cookie.value) : ''
    }))
    return encodeURIComponent(JSON.stringify(values))
  } catch {
    return null
  }
}

function navigationResponse(event) {
  const request = event.request
  const cachePromise = caches.open(HTML_CACHE).catch(() => null)
  const contextPromise = currentNavigationContext()
  const cachedPromise = Promise.all([cachePromise, contextPromise])
    .then(([cache, context]) => cache?.match(context === null ? request : navigationKey(request, context)))
    .catch(() => undefined)
  const refresh = (async () => {
    try {
      return await fetch(request)
    } catch {
      return null
    }
  })()

  // Register synchronously, but keep cache work separate from response delivery.
  event.waitUntil(refresh.then(async (response) => {
    try {
      if (!response?.ok) return
      // Clone before awaiting storage: the browser may consume the original now.
      const cacheResponse = response.clone()
      const [cache, context] = await Promise.all([cachePromise, contextPromise])
      // Server context describes the cookies that actually produced this HTML;
      // cookie preferences may have changed while the request was in flight.
      const servedContext = response.headers.get('X-BM-Navigation-Context')
      if (cache && (context === null || servedContext !== null)) {
        const key = context === null ? request : navigationKey(request, servedContext)
        await writeCache(cache, HTML_CACHE, key, cacheResponse, MAX_HTML_ENTRIES)
      }
    } catch {
      // Storage failures must not affect successful network navigation.
    }
  }))
  return (async () => {
    const cached = await cachedPromise
    if (cached && await contextPromise !== null) return cached
    const response = await refresh
    if (response) return response
    if (cached) return cached
    try {
      const offlineCache = await caches.open(OFFLINE_CACHE)
      const offline = await offlineCache.match(OFFLINE_URL)
      if (offline) return offline
    } catch {
      // The same inline page works even if browser storage is unavailable.
    }
    return offlinePage()
  })()
}

async function networkFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      await writeCache(cache, cacheName, request, res, maxEntries)
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
    await writeCache(cache, cacheName, request, res, maxEntries)
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (request.mode === 'navigate') {
    if (!isSameOrigin(url)) return
    event.respondWith(navigationResponse(event))
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
