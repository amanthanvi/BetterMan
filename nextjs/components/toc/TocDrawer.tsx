'use client'

import { getScrollBehavior } from '../../lib/scroll'
import { useLang } from '../state/lang'
import { useToc } from '../state/toc'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { Toc } from './Toc'

export function TocDrawer() {
  const toc = useToc()
  const { t } = useLang()

  return (
    <Drawer open={toc.open} onOpenChange={toc.setOpen} label={t('Table of contents')} side="left" panelClassName="p-5">
      <div className="flex items-center justify-between">
        <h2 className="small-caps text-lg font-semibold text-ink">{t('Contents')}</h2>
        <Button variant="outline" size="sm" onClick={() => toc.setOpen(false)}>
          {t('Close')}
        </Button>
      </div>
      <div className="sr-only">{t('Jump to a section in this man page.')}</div>

      <div className="-ml-3.5 mt-4">
        <Toc
          items={toc.items}
          activeId={toc.activeId}
          showTitle={false}
          t={t}
          onNavigate={() => toc.setOpen(false)}
          onNavigateToId={(id) => {
            if (toc.scrollToId) {
              toc.scrollToId(id)
              return
            }
            const behavior = getScrollBehavior()
            document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' })
          }}
        />
      </div>
    </Drawer>
  )
}
