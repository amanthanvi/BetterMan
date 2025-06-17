'use client'

import { useEffect } from 'react'
import { reportWebVitals } from '@/lib/performance/web-vitals'

export function WebVitalsReporter() {
  useEffect(() => {
    reportWebVitals()
  }, [])

  return null
}