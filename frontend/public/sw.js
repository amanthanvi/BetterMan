// Service Worker for offline support
const CACHE_NAME = 'betterman-v1'
const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
]

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response
        }

        return fetch(event.request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          // Cache docs pages and search results
          if (event.request.url.includes('/docs/') || 
              event.request.url.includes('/api/search')) {
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache)
              })
          }

          return response
        })
      })
      .catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/offline')
        }
      })
  )
})

// Background sync for offline searches
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-searches') {
    event.waitUntil(syncOfflineSearches())
  }
})

async function syncOfflineSearches() {
  // Sync any offline searches when back online
  const cache = await caches.open(CACHE_NAME)
  // Implementation depends on offline search storage strategy
}