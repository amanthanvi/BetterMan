'use client'

import { useEffect } from 'react'
import { reportWebVitals } from '@/lib/performance/web-vitals'

export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Delay web vitals reporting to avoid blocking initial render
      const timer = setTimeout(() => {
        reportWebVitals()
      }, 0)
      
      return () => clearTimeout(timer)
    }
  }, [])

  return null
}