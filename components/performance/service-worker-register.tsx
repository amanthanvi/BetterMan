'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
      // Only register service worker after some delay to avoid blocking initial load
      const timer = setTimeout(() => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('SW registered:', registration)
            
            // Check for updates periodically
            const updateInterval = setInterval(() => {
              registration.update()
            }, 60 * 60 * 1000) // Every hour
            
            // Cleanup on unmount
            return () => clearInterval(updateInterval)
          })
          .catch((error) => {
            console.log('SW registration failed:', error)
          })
      }, 2000) // Wait 2 seconds after mount
      
      return () => clearTimeout(timer)
    }
  }, [])

  return null
}