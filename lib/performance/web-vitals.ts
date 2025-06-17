import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } from 'web-vitals'

export interface WebVitalsMetric {
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  id: string
  navigationType: string
}

function sendToAnalytics(metric: WebVitalsMetric) {
  // Use Vercel Analytics
  if (typeof window !== 'undefined' && window.vercel?.analyticsId) {
    const body = {
      dsn: window.vercel.analyticsId,
      id: metric.id,
      page: window.location.pathname,
      href: window.location.href,
      event_name: metric.name,
      value: metric.value.toString(),
      speed: metric.rating,
    }

    const blob = new Blob([JSON.stringify(body)], {
      type: 'application/json',
    })
    const vitalsUrl = 'https://vitals.vercel-insights.com/v1/vitals'
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(vitalsUrl, blob)
    } else {
      fetch(vitalsUrl, {
        body: blob,
        method: 'POST',
        keepalive: true,
      })
    }
  }

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Web Vitals]', metric.name, metric.value, metric.rating)
  }
}

export function reportWebVitals() {
  if (typeof window === 'undefined') return

  onCLS((metric) => sendToAnalytics(metric as WebVitalsMetric))
  onFCP((metric) => sendToAnalytics(metric as WebVitalsMetric))
  onFID((metric) => sendToAnalytics(metric as WebVitalsMetric))
  onINP((metric) => sendToAnalytics(metric as WebVitalsMetric))
  onLCP((metric) => sendToAnalytics(metric as WebVitalsMetric))
  onTTFB((metric) => sendToAnalytics(metric as WebVitalsMetric))
}

// Performance monitoring utilities
export function measurePerformance(name: string, fn: () => void | Promise<void>) {
  const start = performance.now()
  const result = fn()
  
  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start
      performance.measure(name, {
        start,
        duration,
      })
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`)
      }
    })
  } else {
    const duration = performance.now() - start
    performance.measure(name, {
      start,
      duration,
    })
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`)
    }
  }
}

// Resource hints
export function prefetchResource(url: string) {
  if (typeof window === 'undefined') return
  
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = url
  document.head.appendChild(link)
}

export function preconnectOrigin(origin: string) {
  if (typeof window === 'undefined') return
  
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = origin
  document.head.appendChild(link)
}

// Lazy load images with intersection observer
export function lazyLoadImage(img: HTMLImageElement) {
  if (!('IntersectionObserver' in window)) {
    // Fallback for older browsers
    img.src = img.dataset.src || ''
    return
  }

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const image = entry.target as HTMLImageElement
        image.src = image.dataset.src || ''
        image.classList.add('loaded')
        observer.unobserve(image)
      }
    })
  })

  imageObserver.observe(img)
}