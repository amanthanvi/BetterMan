/* BetterMan service worker (minimal, no Workbox). */

const CACHE_VERSION = 'v0.6.5-2'
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
body { margin: 0; background: #f9f7f2; color: #1c1a16; font: 16px/1.55 system-ui, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem; }
header { display: flex; justify-content: space-between; padding: .7rem 0 .65rem; border-bottom: 1px solid #e4dfd4; color: #6e685d; font: 15px/1.2 Georgia, serif; font-variant-caps: all-small-caps; letter-spacing: .08em; }
h1 { margin: 12vh 0 1rem; font: 400 1.625rem/1.3 ui-monospace, monospace; }
a { color: inherit; text-decoration-color: #c9c1b2; text-underline-offset: 3px; }
a:hover { color: #a3261b; }
a:focus-visible { outline: 2px solid #a3261b; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  body { background: #131210; color: #ece7dd; }
  header { border-color: #2b2925; color: #9a9385; }
  a { text-decoration-color: #46423b; }
  a:hover { color: #ec8a76; }
  a:focus-visible { outline-color: #ec8a76; }
}
</style>
</head>
<body>
<main>
<header><span>BETTERMAN(1)</span><span>BETTERMAN(1)</span></header>
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
      // Remove the unhashed tracker left by older workers without evicting offline pages.
      await Promise.all(keys.filter((key) => key.startsWith(`${CACHE_PREFIX}-static-`)).map(async (key) => {
        await (await caches.open(key)).delete('/assets/site.js')
      })).catch(() => {})
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
      ).catch(() => {})
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
  // The upstream tracker has no content hash; let its HTTP TTL refresh it.
  if (url.pathname === '/assets/site.js') return

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
