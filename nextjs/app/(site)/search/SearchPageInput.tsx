'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useDistro } from '../../../components/state/distro'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'

/**
 * Progressive enhancement over the GET form: typing debounces into
 * router.replace, so results re-render live while the URL stays shareable
 * and the plain form submit keeps working without JS.
 */
export function SearchPageInput({
  initialQ,
  section,
}: {
  initialQ: string
  section: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialQ)
  const debounced = useDebouncedValue(value, 250)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const initialQuery = initialQ.trim().slice(0, 120)
  const lastPushedRef = useRef(initialQuery)
  const restoreFocusRef = useRef(false)
  const isExternalNavigation = initialQuery !== lastPushedRef.current
  const { urlDistro: distro } = useDistro()

  useEffect(() => {
    const cancelFocusRestore = () => {
      restoreFocusRef.current = false
    }
    const cancelFocusRestoreOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && inputRef.current?.contains(event.target)) return
      cancelFocusRestore()
    }
    const cancelFocusRestoreOnTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') cancelFocusRestore()
    }

    window.addEventListener('pointerdown', cancelFocusRestoreOnPointerDown, true)
    window.addEventListener('keydown', cancelFocusRestoreOnTab, true)
    return () => {
      window.removeEventListener('pointerdown', cancelFocusRestoreOnPointerDown, true)
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
    if (distro) params.set('distro', distro)
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
      onChange={(e) => setValue(e.target.value.slice(0, 120))}
      placeholder="search man pages…"
      data-bm-page-search
      autoComplete="off"
      autoFocus={!initialQ}
      className="bm-field pt-1.5 pb-2 text-lg placeholder:font-serif placeholder:italic"
      aria-label="Search man pages"
    />
  )
}
