'use client'

import { useToc } from '../state/toc'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { Toc } from './Toc'

export function TocDrawer() {
  const toc = useToc()

  return (
    <Drawer open={toc.open} onOpenChange={toc.setOpen} label="Table of contents" side="left" panelClassName="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Table of contents</h2>
        <Button variant="outline" size="sm" onClick={() => toc.setOpen(false)}>
          Close
        </Button>
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
    </Drawer>
  )
}
