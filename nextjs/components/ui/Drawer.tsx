'use client'

import type { ReactNode } from 'react'

import { cx } from './cx'
import { Overlay } from './Dialog'

const SIDE = {
  left: {
    closed: '-translate-x-full',
    base: 'absolute inset-y-0 left-0 w-[min(88vw,20rem)] border-r border-edge bg-raised',
  },
  right: {
    closed: 'translate-x-full',
    base: 'absolute inset-y-0 right-0 w-[min(92vw,24rem)] border-l border-edge bg-raised',
  },
  bottom: {
    closed: 'translate-y-full',
    base: 'absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-edge bg-raised',
  },
  /* Bottom sheet on mobile, right panel from sm up. */
  'sheet-right': {
    closed: 'translate-y-full sm:translate-y-0 sm:translate-x-full',
    base: 'absolute inset-x-0 bottom-0 max-h-[75vh] rounded-t-xl border-t border-edge bg-raised sm:inset-x-auto sm:top-0 sm:right-0 sm:max-h-none sm:w-[min(92vw,20rem)] sm:rounded-none sm:border-t-0 sm:border-l',
  },
} as const

export function Drawer({
  open,
  onOpenChange,
  label,
  side = 'right',
  children,
  panelClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  side?: keyof typeof SIDE
  children: ReactNode
  panelClassName?: string
}) {
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      positionClassName={cx(
        SIDE[side].base,
        'overflow-y-auto transition-transform duration-200 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0 translate-y-0' : SIDE[side].closed,
      )}
      panelClassName={panelClassName}
    >
      {children}
    </Overlay>
  )
}
