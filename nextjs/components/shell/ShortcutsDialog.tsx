'use client'

import { useEffect, useRef, useState } from 'react'

import { useFocusTrap } from '../../lib/useFocusTrap'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'

export function ShortcutsDialog({
  open,
  onOpenChange,
  isManPage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isManPage: boolean
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(open)

  useFocusTrap(open, dialogRef)
  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }

    const t = window.setTimeout(() => setMounted(false), 150)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open])

  if (!mounted) return null

  const groups: Array<{ title: string; items: Array<{ keys: string[]; desc: string }> }> = [
    {
      title: 'Navigation',
      items: [
        { keys: ['H'], desc: 'Open history' },
        { keys: ['T'], desc: 'Scroll to top' },
      ],
    },
    {
      title: 'Search',
      items: [
        { keys: ['Ctrl/⌘', 'K'], desc: 'Open command palette' },
        { keys: ['/'], desc: 'Focus search (or open palette)' },
      ],
    },
    {
      title: 'Page',
      items: [{ keys: ['B'], desc: 'Toggle navigator' }],
    },
    {
      title: 'Actions',
      items: [
        { keys: ['D'], desc: 'Cycle theme' },
        { keys: ['?'], desc: 'Show keyboard shortcuts' },
      ],
    },
  ]

  if (isManPage) {
    groups.push({
      title: 'Man Page',
      items: [
        { keys: ['M'], desc: 'Toggle bookmark' },
        { keys: ['P'], desc: 'Open reading preferences' },
        { keys: ['Enter'], desc: 'Next find match' },
        { keys: ['Shift', 'Enter'], desc: 'Previous find match' },
      ],
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onClick={() => onOpenChange(false)}
    >
      <div className={`absolute inset-0 bg-black/60 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} />
      <div
        ref={dialogRef}
        className={`relative mx-auto mt-24 w-[min(92vw,38rem)] rounded-[var(--bm-radius-lg)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-6 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[14px] font-semibold tracking-tight text-[color:var(--bm-fg)]">Keyboard shortcuts</div>
            <div className="mt-1 text-[13px] text-[color:var(--bm-muted)]">
              Press <span className="font-mono">Esc</span> to close.
            </div>
          </div>
          <button
            type="button"
            className="h-9 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 font-mono text-[13px] text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bm-accent)/0.35]"
            onClick={() => onOpenChange(false)}
          >
            Esc
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className="space-y-3">
              <div className="font-mono text-[11px] tracking-wide text-[color:var(--bm-muted)]">{g.title}</div>
              <ul className="space-y-2">
                {g.items.map((it) => (
                  <li key={`${g.title}:${it.desc}`} className="flex items-start justify-between gap-4">
                    <div className="min-w-0 text-[13px] text-[color:var(--bm-muted)]">{it.desc}</div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-[11px] text-[color:var(--bm-fg)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
