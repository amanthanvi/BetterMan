'use client'

import { useEffect } from 'react'

import { trackEvent } from '../../lib/analytics'

/** Counts one rendered explanation (docs/analytics.md): the event name only, never the line. */
export function ExplainUsed() {
  useEffect(() => {
    trackEvent('explain used')
  }, [])
  return null
}
