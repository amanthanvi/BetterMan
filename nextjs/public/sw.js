/* BetterMan service worker (minimal, no Workbox). */

const CACHE_VERSION = 'v0.6.5-1'
const CACHE_PREFIX = 'bm'

const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`
const HTML_CACHE = `${CACHE_PREFIX}-html-${CACHE_VERSION}`
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`

const MAX_STATIC_ENTRIES = 200
const MAX_HTML_ENTRIES = 80
const MAX_API_ENTRIES = 200

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · BetterMan</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; background: #faf8f5; color: #1c1a17; font: 16px/1.6 system-ui, sans-serif; }
main { max-width: 48rem; margin: 0 auto; padding: 2rem 1.5rem; }
header { padding-bottom: .5rem; border-bottom: 1px solid #e6e1d9; font: 600 12px/1.5 ui-monospace, monospace; letter-spacing: .08em; }
h1 { margin: 2rem 0 1rem; font-size: 1rem; font-weight: 400; color: #6f695f; }
a { color: #c22126; font-family: ui-monospace, monospace; text-underline-offset: 4px; }
a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  body { background: #0b0b0d; color: #ededf0; }
  header { border-color: #26262b; }
  h1 { color: #9b9ba3; }
  a { color: #e5484d; }
}
</style>
</head>
<body>
<main>
<header>BETTERMAN(1)</header>
<h1>Offline — this page isn't cached</h1>
<a href="/">Go home</a>
</main>
</body>
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
      await Promise.all(
        [
          [STATIC_CACHE, MAX_STATIC_ENTRIES],
          [HTML_CACHE, MAX_HTML_ENTRIES],
          [API_CACHE, MAX_API_ENTRIES],
        ].map(async ([name, maxEntries]) => trimCache(await caches.open(name), maxEntries)),
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

// Called while the respondWith promise is pending, so the worker stays alive
// for the write without the response waiting on it.
function cacheInBackground(event, cache, maxEntries, res) {
  const copy = res.clone()
  event.waitUntil(
    (async () => {
      await cache.put(event.request, copy)
      await trimCache(cache, maxEntries)
    })().catch(() => {}),
  )
}

async function networkFirst(event, cacheName, maxEntries) {
  const request = event.request
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res && res.ok) cacheInBackground(event, cache, maxEntries, res)
    return res
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') return offlinePage()
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(event.request)
  if (cached) return cached

  const res = await fetch(event.request)
  if (res && res.ok) cacheInBackground(event, cache, maxEntries, res)
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, HTML_CACHE, MAX_HTML_ENTRIES))
    return
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event, API_CACHE, MAX_API_ENTRIES))
    return
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE, MAX_STATIC_ENTRIES))
    return
  }
})
