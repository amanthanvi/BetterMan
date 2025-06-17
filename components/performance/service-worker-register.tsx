'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('SW registered:', registration)
            
            // Check for updates periodically
            setInterval(() => {
              registration.update()
            }, 60 * 60 * 1000) // Every hour
          })
          .catch((error) => {
            console.log('SW registration failed:', error)
          })
      })
    }
  }, [])

  return null
}