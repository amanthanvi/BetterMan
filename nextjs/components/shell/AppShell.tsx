'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { InfoResponse } from '../../lib/api'
import { BOOKMARK_TOGGLE_EVENT } from '../../lib/bookmarks'
import { DISTRO_GROUPS, DISTRO_LABEL, normalizeDistro } from '../../lib/distro'
import { formatRelativeTime } from '../../lib/time'
import { CommandPalette } from '../palette/CommandPalette'
import { ReadingPrefsDrawer } from '../reading/ReadingPrefsDrawer'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { TocDrawer } from '../toc/TocDrawer'
import { MobileBottomNav } from './MobileBottomNav'
import { ShortcutsDialog } from './ShortcutsDialog'

function isTypingTarget(el: Element | null) {
  if (!el) return false
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range'].includes(el.type)
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement) return el.isContentEditable
  return false
}

function isElementVisible(el: HTMLElement) {
  return el.getClientRects().length > 0
}

function withDistro(path: string, distro: string): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
}

type IconProps = { className?: string }

function IconCommand({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0 0-6Z" />
    </svg>
  )
}

function IconSun({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function IconSliders({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </svg>
  )
}

function IconList({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

function IconChevronDown({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const distro = useDistro()
  const theme = useTheme()
  const toc = useToc()

  const [q, setQ] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const lastRouteKeyRef = useRef<string | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const isPopRef = useRef(false)

  const routeKey = `${pathname}?${searchParams.toString()}`
  const routeParts = pathname.split('/').filter(Boolean)
  const isManPage = routeParts[0] === 'man' && routeParts.length >= 3

  const [info, setInfo] = useState<InfoResponse | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (distro.distro !== 'debian') params.set('distro', distro.distro)

    void fetch(`/api/v1/info${params.toString() ? `?${params.toString()}` : ''}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as InfoResponse
      })
      .then((payload) => setInfo(payload))
      .catch(() => setInfo(null))

    return () => controller.abort()
  }, [distro.distro])

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore
    })
  }, [])

  useEffect(() => {
    const onPop = () => {
      isPopRef.current = true
    }

    const prev = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.history.scrollRestoration = prev
    }
  }, [])

  useEffect(() => {
    const prevKey = lastRouteKeyRef.current
    if (prevKey) scrollPositionsRef.current.set(prevKey, window.scrollY)

    const nextY = isPopRef.current ? scrollPositionsRef.current.get(routeKey) ?? 0 : 0
    isPopRef.current = false
    lastRouteKeyRef.current = routeKey

    window.scrollTo({ top: nextY, left: 0, behavior: 'auto' })
  }, [routeKey])

  useEffect(() => {
    const h1 = document.querySelector('main h1') as HTMLElement | null
    if (!h1) return
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
    h1.focus({ preventScroll: true })
  }, [routeKey])

  useEffect(() => {
    const FLAG = '__bmPaletteRequested'
    const EVENT = 'bm:palette-request'

    const openIfRequested = () => {
      if (!(window as unknown as Record<string, unknown>)[FLAG]) return
      ;(window as unknown as Record<string, unknown>)[FLAG] = false
      setPaletteOpen(true)
    }

    openIfRequested()

    const onEvent = () => openIfRequested()
    window.addEventListener(EVENT, onEvent)
    return () => window.removeEventListener(EVENT, onEvent)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      if (isTypingTarget(document.activeElement)) return

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        e.preventDefault()
        const headerSearch = searchRef.current
        if (headerSearch && isElementVisible(headerSearch)) {
          headerSearch.focus()
          headerSearch.select()
          return
        }

        const homeSearch = document.querySelector('[data-bm-home-search]') as HTMLInputElement | null
        if (homeSearch) {
          homeSearch.focus()
          homeSearch.select()
          return
        }

        setPaletteOpen(true)
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        theme.cycle()
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'b' && toc.items.length) {
        e.preventDefault()
        if (window.matchMedia('(min-width: 1024px)').matches) {
          toc.setSidebarOpen(!toc.sidebarOpen)
        } else {
          toc.setOpen(!toc.open)
        }
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        router.push('/history')
        return
      }

      if (isManPage && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPrefsOpen(true)
        return
      }

      if (isManPage && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        try {
          window.dispatchEvent(new CustomEvent(BOOKMARK_TOGGLE_EVENT))
        } catch {
          // ignore
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isManPage, router, theme, toc])

  useEffect(() => {
    if (!isManPage) return
    if (!toc.items.length) return

    let tracking = false
    let startX = 0
    let startY = 0
    let opened = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      tracking = startX <= 40
      opened = false
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking || opened) return
      if (window.matchMedia('(min-width: 1024px)').matches) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (dx > 72 && Math.abs(dy) < 36) {
        opened = true
        tracking = false
        toc.setOpen(true)
      }
    }

    const onEnd = () => {
      tracking = false
      opened = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [isManPage, toc])

  return (
    <div className="min-h-dvh bg-[var(--bm-bg)] text-[var(--bm-fg)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--bm-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--bm-accent-contrast)]"
      >
        Skip to content
      </a>
      <header
        data-bm-app-header
        aria-label="Site header"
        className="sticky top-0 z-20 border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <Image src="/betterman-mark.svg" alt="" className="size-6" width={24} height={24} priority />
            BetterMan
          </Link>

          {info ? (
            <div className="hidden items-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65] px-3 py-1 text-xs text-[color:var(--bm-muted)] shadow-sm backdrop-blur md:flex">
              <span className="font-mono text-[color:var(--bm-fg)]">{info.datasetReleaseId}</span>
              <span aria-hidden="true">·</span>
              <span>{info.pageCount.toLocaleString()} pages</span>
              <span aria-hidden="true">·</span>
              <span>updated {formatRelativeTime(info.lastUpdated)}</span>
            </div>
          ) : null}

          {pathname !== '/' ? (
            <form
              className="hidden flex-1 sm:block"
              onSubmit={(e) => {
                e.preventDefault()
                const query = q.trim()
                if (!query) return
                router.push(withDistro(`/search?q=${encodeURIComponent(query)}`, distro.distro))
              }}
            >
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search commands…"
                className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                aria-label="Search man pages"
              />
            </form>
          ) : null}

          <div className="relative">
            <select
              value={distro.distro}
              onChange={(e) => {
                const next = normalizeDistro(e.target.value)
                if (next) distro.setDistro(next)
              }}
              className="appearance-none rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 pr-9 text-xs font-medium text-[color:var(--bm-fg)] outline-none hover:bg-[color:var(--bm-surface)/0.9] focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] sm:text-sm"
              aria-label="Select distribution"
            >
              {DISTRO_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((d) => (
                    <option key={d} value={d}>
                      {DISTRO_LABEL[d]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--bm-muted)]" />
          </div>

          <button
            type="button"
            className="hidden items-center justify-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-xs font-medium text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.9] sm:inline-flex"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
            title="Command palette (Ctrl/⌘ K)"
          >
            <IconCommand className="size-4" />
            <span className="hidden xl:inline font-mono text-xs text-[color:var(--bm-muted)]">Ctrl/⌘ K</span>
          </button>
          <button
            type="button"
            className="hidden items-center justify-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] sm:inline-flex"
            onClick={() => theme.cycle()}
            title={`Theme: ${theme.mode}`}
            aria-label="Cycle theme"
          >
            <IconSun className="size-4" />
            <span className="hidden xl:inline">Theme</span>
          </button>
          {isManPage ? (
            <button
              type="button"
              className="hidden items-center justify-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] sm:inline-flex"
              onClick={() => setPrefsOpen(true)}
              title="Reading preferences"
              aria-label="Open reading preferences"
            >
              <IconSliders className="size-4" />
              <span className="hidden xl:inline">Prefs</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] lg:hidden ${
              toc.items.length ? '' : 'invisible pointer-events-none'
            }`}
            onClick={() => toc.setOpen(true)}
            tabIndex={toc.items.length ? 0 : -1}
            aria-hidden={!toc.items.length}
            aria-label="TOC"
            title="Table of contents"
          >
            <IconList className="size-4" />
            <span className="hidden sm:inline sm:pl-1.5">TOC</span>
          </button>
        </div>
        {offline ? (
          <div className="border-t border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65] px-4 py-2 text-xs text-[color:var(--bm-muted)]">
            Offline — showing cached content
          </div>
        ) : null}
      </header>

      <TocDrawer />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} isManPage={isManPage} />
      <ReadingPrefsDrawer open={prefsOpen} onOpenChange={setPrefsOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:pb-10">
        {children}
      </main>

      <footer data-bm-app-footer aria-label="Site footer" className="border-t border-[var(--bm-border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-[color:var(--bm-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[color:var(--bm-fg)]">BetterMan</div>
            {info ? (
              <div className="font-mono text-[10px] sm:text-xs">
                Dataset {info.datasetReleaseId} · {info.pageCount.toLocaleString()} pages · updated{' '}
                {formatRelativeTime(info.lastUpdated)}
              </div>
            ) : null}
          </div>
          <Link href={withDistro('/licenses', distro.distro)} className="underline underline-offset-4">
            Licenses
          </Link>
        </div>
      </footer>

      <MobileBottomNav onMore={() => setPaletteOpen(true)} />
    </div>
  )
}
