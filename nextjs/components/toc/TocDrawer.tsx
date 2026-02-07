'use client'

import { useEffect } from 'react'

import { useToc } from '../state/toc'

export function TocDrawer() {
  const toc = useToc()

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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40" onMouseDown={() => toc.setOpen(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative h-full w-[min(90vw,24rem)] overflow-y-auto border-r border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] p-5 shadow-xl backdrop-blur"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold tracking-tight">Table of contents</div>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
            onClick={() => toc.setOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="sr-only">Jump to a section in this man page.</div>

        <div className="mt-4">
          <ol className="space-y-1">
            {toc.items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.75] hover:text-[color:var(--bm-fg)]"
                  onClick={() => {
                    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                    document.getElementById(t.id)?.scrollIntoView({ behavior, block: 'start' })
                    window.location.hash = t.id
                    toc.setOpen(false)
                  }}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

