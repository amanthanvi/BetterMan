'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useDistro } from '../../../components/state/distro'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'

/**
 * Progressive enhancement over the GET form: typing debounces into
 * router.replace, so results re-render live while the URL stays shareable
 * and the plain form submit keeps working without JS. Home uses it too, with
 * `path="/"` so its results render inline, and a living placeholder.
 */
export function SearchPageInput({
  initialQ,
  section,
  path = '/search',
  home = false,
  placeholders,
  className = 'bm-field pt-1.5 pb-2 text-lg placeholder:font-serif placeholder:italic',
}: {
  initialQ: string
  section: string
  path?: '/search' | '/'
  /** Marks the home field (`data-bm-home-search`) instead of the page field. */
  home?: boolean
  /** Cycled while the field is empty; the first stays put under reduced motion. */
  placeholders?: readonly string[]
  className?: string
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
  const placeholder = useLivingPlaceholder(placeholders, value === '')

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
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
  }, [debounced, distro, isExternalNavigation, path, router, section, value])

  return (
    <input
      ref={inputRef}
      name="q"
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value.slice(0, 120))}
      placeholder={placeholder ?? 'search man pages…'}
      {...(home ? { 'data-bm-home-search': '' } : { 'data-bm-page-search': '' })}
      autoComplete="off"
      spellCheck={false}
      autoFocus={!initialQ}
      className={className}
      aria-label="Search man pages"
    />
  )
}

const PLACEHOLDER_MS = 3200

/** Rotates through example queries while the field is empty and motion is welcome. */
function useLivingPlaceholder(placeholders: readonly string[] | undefined, empty: boolean) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!placeholders || placeholders.length < 2 || !empty) return
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
    if (!motion.matches) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % placeholders.length), PLACEHOLDER_MS)
    return () => window.clearInterval(timer)
  }, [empty, placeholders])
  return placeholders?.[index]
}
