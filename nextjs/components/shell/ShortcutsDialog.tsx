'use client'

import { Dialog } from '../ui/Dialog'
import { Kbd } from '../ui/Kbd'
import { Button } from '../ui/Button'

function shortcutGroupId(title: string): string {
  return `bm-shortcuts-${title.toLowerCase().replaceAll(' ', '-')}`
}

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
        { keys: ['/'], desc: 'Focus search (find, on a man page)' },
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
        { keys: ['/', 'F'], desc: 'Find in page' },
        { keys: ['n', 'N'], desc: 'Next, previous match' },
        { keys: ['j', 'k'], desc: 'Scroll down, up' },
        { keys: ['g', 'G'], desc: 'Top, bottom' },
        { keys: ['[', ']'], desc: 'Previous, next section' },
        { keys: ['M'], desc: 'Toggle bookmark' },
        { keys: ['P'], desc: 'Open reading preferences' },
        { keys: ['Enter'], desc: 'Next find match (in find)' },
        { keys: ['Shift', 'Enter'], desc: 'Previous find match (in find)' },
      ],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} label="Keyboard shortcuts">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="small-caps text-lg font-semibold text-ink">Keyboard shortcuts</h2>
          <p className="mt-1 text-sm text-ink-3">
            Press <Kbd>Esc</Kbd> to close.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} aria-label="Close keyboard shortcuts, Esc">
          Esc
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={shortcutGroupId(g.title)} className="space-y-3">
            <h3 id={shortcutGroupId(g.title)} className="text-sm font-semibold text-ink-2">
              {g.title}
            </h3>
            <ul className="space-y-1.5">
              {g.items.map((it) => (
                <li key={`${g.title}:${it.desc}`} className="flex items-start justify-between gap-4">
                  <div className="min-w-0 text-sm text-ink-2">{it.desc}</div>
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
