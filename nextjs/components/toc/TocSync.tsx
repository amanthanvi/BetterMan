'use client'

import { useEffect } from 'react'

import type { TocItem } from '../../lib/docModel'
import { useToc } from '../state/toc'

export function TocSync({ items }: { items: TocItem[] }) {
  const toc = useToc()

  useEffect(() => {
    toc.setItems(items ?? [])
    return () => toc.setItems([])
  }, [items, toc])

  return null
}

