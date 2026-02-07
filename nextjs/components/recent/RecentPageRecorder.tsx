'use client'

import { useEffect } from 'react'

import { recordRecentPage } from '../../lib/recent'

export function RecentPageRecorder({ name, section, description }: { name: string; section: string; description?: string }) {
  useEffect(() => {
    recordRecentPage({ name, section, description })
  }, [description, name, section])

  return null
}

