/**
 * Preloading utilities for performance optimization
 */

import { config } from '@/utils/config';

// Critical routes that should be preloaded
const CRITICAL_ROUTES = [
  '/docs',
  '/search',
  '/favorites',
];

// Preload a route component
export function preloadRoute(path: string) {
  switch (path) {
    case '/':
      return import('@/pages/HomePage');
    case '/docs':
      return import('@/pages/DocsListPage');
    case '/search':
      return import('@/components/search/SearchInterface');
    case '/favorites':
      return import('@/pages/FavoritesPage');
    case '/settings':
      return import('@/pages/SettingsPage');
    case '/analytics':
      return import('@/pages/AnalyticsPage');
    default:
      return Promise.resolve();
  }
}

// Preload critical routes on idle
export function preloadCriticalRoutes() {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      CRITICAL_ROUTES.forEach(route => {
        preloadRoute(route).catch(() => {
          // Silently fail preloading
        });
      });
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      CRITICAL_ROUTES.forEach(route => {
        preloadRoute(route).catch(() => {
          // Silently fail preloading
        });
      });
    }, 2000);
  }
}

// Resource hints for external resources
export function addResourceHints() {
  const head = document.head;
  
  // Preconnect to API server
  const apiUrl = config.apiUrl;
  
  // Skip if using relative URLs in production
  if (!apiUrl) return;
  
  try {
    const apiOrigin = new URL(apiUrl).origin;
    
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = apiOrigin;
    preconnect.crossOrigin = 'anonymous';
    head.appendChild(preconnect);
    
    // DNS prefetch as fallback
    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = apiOrigin;
    head.appendChild(dnsPrefetch);
  } catch (error) {
    console.warn('Failed to add resource hints:', error);
  }
}

// Intersection Observer for lazy loading images
export function setupLazyLoading() {
  if (!('IntersectionObserver' in window)) {
    return;
  }
  
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.01
  });
  
  // Observe all images with data-src
  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// Prefetch document data on hover
export function prefetchDocument(documentId: string) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  // Create a link element for prefetching
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = `${apiUrl}/api/docs/${documentId}`;
  link.as = 'fetch';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  
  // Also preload the document viewer component
  import('@/pages/DocumentPage').catch(() => {
    // Silently fail
  });
}

// Setup hover prefetching
export function setupHoverPrefetching() {
  let prefetchTimer: NodeJS.Timeout | null = null;
  
  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[href^="/docs/"]');
    
    if (link) {
      const href = link.getAttribute('href');
      if (href) {
        // Delay prefetch to avoid excessive requests
        prefetchTimer = setTimeout(() => {
          const docId = href.split('/').pop();
          if (docId) {
            prefetchDocument(docId);
          }
        }, 200);
      }
    }
  });
  
  document.addEventListener('mouseout', (e) => {
    if (prefetchTimer) {
      clearTimeout(prefetchTimer);
      prefetchTimer = null;
    }
  });
}