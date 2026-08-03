'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { Distro } from '../../lib/distro'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

/**
 * Progressive enhancement over the GET form: typing debounces into
 * router.replace, so results re-render live while the URL stays shareable
 * and the plain form submit keeps working without JS.
 */
export function SearchPageInput({
  initialQ,
  section,
  distro,
}: {
  initialQ: string
  section: string
  distro: Distro
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialQ)
  const debounced = useDebouncedValue(value, 250)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const initialQuery = initialQ.trim().slice(0, 120)
  const lastPushedRef = useRef(initialQuery)
  const restoreFocusRef = useRef(false)
  const isExternalNavigation = initialQuery !== lastPushedRef.current

  useEffect(() => {
    const cancelFocusRestore = () => {
      restoreFocusRef.current = false
    }
    const cancelFocusRestoreOnTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') cancelFocusRestore()
    }

    window.addEventListener('pointerdown', cancelFocusRestore, true)
    window.addEventListener('keydown', cancelFocusRestoreOnTab, true)
    return () => {
      window.removeEventListener('pointerdown', cancelFocusRestore, true)
      window.removeEventListener('keydown', cancelFocusRestoreOnTab, true)
    }
  }, [])

  /* Adopt externally-navigated queries (palette search while already on
     /search) — our own replaces update lastPushedRef first, so this only
     fires for URL changes we didn't initiate. */
  useEffect(() => {
    const next = initialQ.trim().slice(0, 120)
    if (next === lastPushedRef.current) {
      if (restoreFocusRef.current) {
        const frame = window.requestAnimationFrame(() => {
          if (!restoreFocusRef.current) return
          restoreFocusRef.current = false
          inputRef.current?.focus({ preventScroll: true })
        })
        return () => window.cancelAnimationFrame(frame)
      }
      return
    }
    restoreFocusRef.current = false
    lastPushedRef.current = next
    setValue(initialQ)
  }, [initialQ])

  useEffect(() => {
    const next = debounced.trim().slice(0, 120)
    const current = value.trim().slice(0, 120)
    if (isExternalNavigation || next !== current) return
    if (next === lastPushedRef.current) return
    lastPushedRef.current = next

    const params = new URLSearchParams()
    if (next) params.set('q', next)
    if (section) params.set('section', section)
    if (distro !== 'debian') params.set('distro', distro)
    const qs = params.toString()
    restoreFocusRef.current = document.activeElement === inputRef.current
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false })
  }, [debounced, distro, isExternalNavigation, router, section, value])

  return (
    <input
      ref={inputRef}
      name="q"
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="search man pages…"
      data-bm-page-search
      autoComplete="off"
      autoFocus={!initialQ}
      className="h-12 w-full border-0 border-b border-edge bg-transparent px-1 font-mono text-sm text-fg transition-colors placeholder:text-muted hover:border-edge-strong"
      aria-label="Search man pages"
    />
  )
}
