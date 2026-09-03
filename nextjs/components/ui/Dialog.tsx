'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { cx } from './cx'

const EXIT_MS = 200

/**
 * Shared overlay chassis: portal, scrim, focus trap, scroll lock, Escape,
 * click-outside, and scrim transition. Dialog and Drawer both sit on it.
 */
export function Overlay({
  open,
  onOpenChange,
  label,
  children,
  panelClassName,
  positionClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: ReactNode
  panelClassName?: string
  positionClassName: string
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(open)

  useFocusTrap(open && mounted, panelRef)
  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = window.setTimeout(() => setMounted(false), EXIT_MS)
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

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? label : undefined}
      className={cx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}
      onClick={() => onOpenChange(false)}
    >
      <div
        className={cx('absolute inset-0 bg-scrim transition-opacity motion-reduce:transition-none', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-state={open ? 'open' : 'closed'}
        className={cx(positionClassName, panelClassName)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Dialog({
  open,
  onOpenChange,
  label,
  children,
  panelClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: ReactNode
  panelClassName?: string
}) {
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      positionClassName={cx(
        'relative mx-auto mt-24 w-[min(92vw,38rem)] border border-edge bg-raised p-6 shadow-lg shadow-black/25 motion-reduce:animate-none',
        open ? 'bm-pop-in' : 'bm-pop-out motion-reduce:invisible',
      )}
      panelClassName={panelClassName}
    >
      {children}
    </Overlay>
  )
}
