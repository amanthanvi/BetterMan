'use client'

import { shortcutGroups } from '../../lib/shortcuts'
import { tRich } from '../../lib/i18n/rich'
import { useT } from '../state/lang'
import { Dialog } from '../ui/Dialog'
import { Kbd } from '../ui/Kbd'
import { Button } from '../ui/Button'

function shortcutGroupId(id: string): string {
  return `bm-shortcuts-${id}`
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
  const t = useT()
  const groups = shortcutGroups(isManPage)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} label={t('Keyboard shortcuts')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="small-caps text-lg font-semibold text-ink">{t('Keyboard shortcuts')}</h2>
          <p className="mt-1 text-sm text-ink-3">
            {tRich(t, 'Press {key} to close.', { key: <Kbd>Esc</Kbd> })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} aria-label={t('Close keyboard shortcuts, Esc')}>
          Esc
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={shortcutGroupId(g.id)} className="space-y-3">
            <h3 id={shortcutGroupId(g.id)} className="text-sm font-semibold text-ink-2">
              {t(g.title)}
            </h3>
            <ul className="space-y-1.5">
              {g.items.map((it) => (
                <li key={`${g.id}:${it.desc}`} className="flex items-start justify-between gap-4">
                  <div className="min-w-0 text-sm text-ink-2">{t(it.desc)}</div>
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
