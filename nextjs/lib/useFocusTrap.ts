'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(open: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const listFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0,
      )

    const ensureFocusInside = () => {
      if (container.contains(document.activeElement)) return
      const focusable = listFocusable()
      ;(focusable[0] ?? container).focus()
    }

    const raf = window.requestAnimationFrame(() => ensureFocusInside())

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = listFocusable()
      if (!focusable.length) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (!active || active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
        return
      }

      if (!active || active === last || !container.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(raf)
      container.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, [containerRef, open])
}

