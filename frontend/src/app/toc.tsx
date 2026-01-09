import { createContext, useContext, useMemo, useState } from 'react'

import type { TocItem } from '../api/types'

type ScrollToId = (id: string) => void

type TocContextValue = {
  items: TocItem[]
  setItems: (items: TocItem[]) => void
  open: boolean
  setOpen: (open: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  scrollToId: ScrollToId | null
  setScrollToId: (fn: ScrollToId | null) => void
}

const TocContext = createContext<TocContextValue | null>(null)

export function TocProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TocItem[]>([])
  const [open, setOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [scrollToId, _setScrollToId] = useState<ScrollToId | null>(null)
  const setScrollToId = (fn: ScrollToId | null) => _setScrollToId(fn ? () => fn : null)

  const value = useMemo(
    () => ({ items, setItems, open, setOpen, sidebarOpen, setSidebarOpen, scrollToId, setScrollToId }),
    [items, open, sidebarOpen, scrollToId],
  )

  return <TocContext.Provider value={value}>{children}</TocContext.Provider>
}

export function useToc(): TocContextValue {
  const ctx = useContext(TocContext)
  if (!ctx) throw new Error('useToc must be used within <TocProvider>')
  return ctx
}
