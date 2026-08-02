'use client'

import { Dialog } from '../ui/Dialog'
import { Kbd } from '../ui/Kbd'
import { Button } from '../ui/Button'

export function ShortcutsDialog({
  open,
  onOpenChange,
  isManPage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isManPage: boolean
}) {
  const groups: Array<{ title: string; items: Array<{ keys: string[]; desc: string }> }> = [
    {
      title: 'Navigation',
      items: [
        { keys: ['H'], desc: 'Jump to recent pages on Home' },
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
      items: [{ keys: ['B'], desc: 'Toggle sidebar' }],
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
    <Dialog open={open} onOpenChange={onOpenChange} label="Keyboard shortcuts">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold tracking-tight text-fg">Keyboard shortcuts</div>
          <div className="mt-1 text-sm text-muted">
            Press <span className="font-mono">Esc</span> to close.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} aria-label="Close keyboard shortcuts">
          Esc
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="space-y-3">
            <div className="font-mono text-xs tracking-wide text-muted">{g.title}</div>
            <ul className="space-y-2">
              {g.items.map((it) => (
                <li key={`${g.title}:${it.desc}`} className="flex items-start justify-between gap-4">
                  <div className="min-w-0 text-sm text-muted">{it.desc}</div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {it.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
