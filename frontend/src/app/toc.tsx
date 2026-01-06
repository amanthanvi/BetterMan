import { createContext, useContext, useMemo, useState } from 'react'

import type { TocItem } from '../api/types'

type TocContextValue = {
  items: TocItem[]
  setItems: (items: TocItem[]) => void
  open: boolean
  setOpen: (open: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

const TocContext = createContext<TocContextValue | null>(null)

export function TocProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TocItem[]>([])
  const [open, setOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const value = useMemo(
    () => ({ items, setItems, open, setOpen, sidebarOpen, setSidebarOpen }),
    [items, open, sidebarOpen],
  )

  return <TocContext.Provider value={value}>{children}</TocContext.Provider>
}

export function useToc(): TocContextValue {
  const ctx = useContext(TocContext)
  if (!ctx) throw new Error('useToc must be used within <TocProvider>')
  return ctx
}
