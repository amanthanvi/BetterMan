'use client'

import { useEffect } from 'react'

export function ShortcutsDialog({
  open,
  onOpenChange,
  isManPage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isManPage: boolean
}) {
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

  if (!open) return null

  const groups: Array<{ title: string; items: Array<{ keys: string[]; desc: string }> }> = [
    {
      title: 'Global',
      items: [
        { keys: ['Ctrl/⌘', 'K'], desc: 'Open command palette' },
        { keys: ['/'], desc: 'Focus search (or open palette)' },
        { keys: ['?'], desc: 'Show keyboard shortcuts' },
        { keys: ['D'], desc: 'Cycle theme' },
        { keys: ['B'], desc: 'Toggle TOC' },
        { keys: ['T'], desc: 'Scroll to top' },
        { keys: ['H'], desc: 'Open history' },
      ],
    },
  ]

  if (isManPage) {
    groups.push({
      title: 'Man page',
      items: [
        { keys: ['M'], desc: 'Toggle bookmark' },
        { keys: ['P'], desc: 'Open reading preferences' },
        { keys: ['Enter'], desc: 'Next find match' },
        { keys: ['Shift', 'Enter'], desc: 'Previous find match' },
      ],
    })
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50" onMouseDown={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="relative mx-auto mt-24 w-[min(92vw,38rem)] rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] p-6 shadow-xl backdrop-blur"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold tracking-tight">Keyboard shortcuts</div>
            <div className="mt-1 text-sm text-[color:var(--bm-muted)]">
              Press <span className="font-mono">Esc</span> to close.
            </div>
          </div>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {groups.map((g) => (
            <section key={g.title}>
              <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">{g.title}</div>
              <ul className="mt-3 space-y-2">
                {g.items.map((it) => (
                  <li key={`${g.title}:${it.desc}`} className="flex items-center justify-between gap-4">
                    <div className="text-sm text-[color:var(--bm-muted)]">{it.desc}</div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-lg border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-2 py-1 font-mono text-xs text-[color:var(--bm-fg)]"
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
