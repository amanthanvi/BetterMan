'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

type UiTheme = 'default' | 'retro' | 'glass'

type UiThemeOption = {
  id: UiTheme
  name: string
}

const UI_THEME_COOKIE = 'bm-ui-theme'
const UI_THEME_ATTR = 'data-bm-ui-theme'
const UI_THEME_OPTIONS: UiThemeOption[] = [
  { id: 'default', name: 'Default' },
  { id: 'retro', name: 'Retro' },
  { id: 'glass', name: 'Glass' },
]

function parseUiTheme(value: string | null | undefined): UiTheme {
  if (value === 'retro' || value === 'glass' || value === 'default') return value
  return 'default'
}

function readCookie(name: string): string | null {
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`))

  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.split('=')[1] ?? '')
  } catch {
    return null
  }
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

function applyUiTheme(value: UiTheme) {
  document.documentElement.setAttribute(UI_THEME_ATTR, value)
}

export function ThemeSwitcher() {
  const menuId = useId()
  const [uiTheme, setUiTheme] = useState<UiTheme>('default')
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setMounted(true)

    const savedTheme = parseUiTheme(readCookie(UI_THEME_COOKIE))
    setUiTheme(savedTheme)
    setActiveIndex(UI_THEME_OPTIONS.findIndex((option) => option.id === savedTheme))
    applyUiTheme(savedTheme)

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    const button = optionRefs.current[activeIndex]
    button?.focus()
  }, [open, activeIndex])

  const selectTheme = (nextTheme: UiTheme) => {
    const nextIndex = UI_THEME_OPTIONS.findIndex((option) => option.id === nextTheme)
    setUiTheme(nextTheme)
    setActiveIndex(nextIndex)
    applyUiTheme(nextTheme)
    writeCookie(UI_THEME_COOKIE, nextTheme)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveActive = (delta: number) => {
    const count = UI_THEME_OPTIONS.length
    setActiveIndex((prev) => (prev + delta + count) % count)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(UI_THEME_OPTIONS.findIndex((option) => option.id === uiTheme))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen((prev) => !prev)
      if (!open) {
        setActiveIndex(UI_THEME_OPTIONS.findIndex((option) => option.id === uiTheme))
      }
    }
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(UI_THEME_OPTIONS.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const selected = UI_THEME_OPTIONS[activeIndex]
      if (selected) selectTheme(selected.id)
    }
  }

  if (!mounted) return null

  const selectedName = UI_THEME_OPTIONS.find((option) => option.id === uiTheme)?.name ?? 'Default'

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex size-9 items-center justify-center rounded-r-md border-y border-r border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label="Select UI theme"
        title={`UI theme: ${selectedName}`}
      >
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-2 w-44 max-w-[calc(100vw-1.25rem)] origin-top-right rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-1"
        >
          {UI_THEME_OPTIONS.map((option, index) => {
            const selected = uiTheme === option.id
            const focused = index === activeIndex
            return (
              <button
                key={option.id}
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={focused ? 0 : -1}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectTheme(option.id)}
                className={`block w-full rounded-sm px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] ${
                  selected
                    ? 'bg-[var(--bm-accent)] font-semibold text-[var(--bm-accent-contrast)]'
                    : 'text-[var(--bm-fg)] hover:bg-[var(--bm-surface-2)]'
                }`}
              >
                {option.name}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
