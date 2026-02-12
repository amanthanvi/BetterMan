'use client'

import { useEffect, useRef } from 'react'

import { useToc } from '../state/toc'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { Toc } from './Toc'

export function TocDrawer() {
  const toc = useToc()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(toc.open, panelRef)
  useBodyScrollLock(toc.open)

  useEffect(() => {
    if (!toc.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      toc.setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toc])

  if (!toc.open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Table of contents"
      className="fixed inset-0 z-40"
      onClick={() => toc.setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        className="relative h-full w-[min(90vw,24rem)] overflow-y-auto border-r border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] p-5  "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Table of contents</h2>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
            onClick={() => toc.setOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="sr-only">Jump to a section in this man page.</div>

        <div className="mt-4">
          <Toc
            items={toc.items}
            showTitle={false}
            onNavigate={() => toc.setOpen(false)}
            onNavigateToId={(id) => {
              if (toc.scrollToId) {
                toc.scrollToId(id)
                return
              }
              const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
              document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' })
            }}
          />
        </div>
      </div>
    </div>
  )
}
