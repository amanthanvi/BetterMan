'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { InfoResponse } from '../../lib/api'
import { BOOKMARK_TOGGLE_EVENT } from '../../lib/bookmarks'
import { isTypingTarget } from '../../lib/dom'
import { withDistro } from '../../lib/distro'
import { formatRelativeTime } from '../../lib/time'
import { CommandPalette } from '../palette/CommandPalette'
import { ReadingPrefsDrawer } from '../reading/ReadingPrefsDrawer'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { TocDrawer } from '../toc/TocDrawer'
import { MobileBottomNav } from './MobileBottomNav'
import { ShortcutsDialog } from './ShortcutsDialog'
import { MoonIcon, SearchIcon, SunIcon } from '../icons'

function isElementVisible(el: HTMLElement) {
  return el.getClientRects().length > 0
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const distro = useDistro()
  const theme = useTheme()
  const toc = useToc()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const [themeAnnouncement, setThemeAnnouncement] = useState('')
  const themeAnnouncementMountedRef = useRef(false)

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
    if (prevKey) {
      scrollPositionsRef.current.set(prevKey, window.scrollY)
      if (scrollPositionsRef.current.size > 100) {
        const firstKey = scrollPositionsRef.current.keys().next().value
        if (firstKey) scrollPositionsRef.current.delete(firstKey)
      }
    }

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
    const EVENT = 'bm:prefs-request'
    const onEvent = () => setPrefsOpen(true)
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

        const pageSearch = document.querySelector('[data-bm-page-search]') as HTMLInputElement | null
        if (pageSearch && isElementVisible(pageSearch)) {
          pageSearch.focus()
          pageSearch.select()
          return
        }

        const homeSearch = document.querySelector('[data-bm-home-search]') as HTMLInputElement | null
        if (homeSearch && isElementVisible(homeSearch)) {
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
    if (!themeAnnouncementMountedRef.current) {
      themeAnnouncementMountedRef.current = true
      return
    }
    setThemeAnnouncement(`Theme: ${theme.mode}.`)
  }, [theme.mode])

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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-[var(--bm-border-accent)] focus:bg-[var(--bm-surface-2)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--bm-fg)]"
      >
        Skip to content
      </a>
      <header
        data-bm-app-header
        aria-label="Site header"
        className="sticky top-0 z-20 border-b border-[var(--bm-border)] bg-[var(--bm-surface-2)]"
      >
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          <Link href={withDistro('/', distro.distro)} className="inline-flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-tight text-[var(--bm-accent)]">&gt;_</span>
            <span className="text-sm font-semibold tracking-tight">BetterMan</span>
          </Link>

          <div aria-live="polite" className="sr-only">
            {themeAnnouncement}
          </div>

          <nav aria-label="Primary" className="hidden flex-1 items-stretch justify-center gap-6 md:flex">
            {(
              [
                { href: withDistro('/', distro.distro), label: 'Home', active: pathname === '/' },
                { href: withDistro('/search', distro.distro), label: 'Search', active: pathname === '/search' },
                { href: withDistro('/licenses', distro.distro), label: 'Licenses', active: pathname === '/licenses' },
              ] as const
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex h-12 items-center border-b-2 px-1 text-sm font-medium transition-colors ${
                  item.active
                    ? 'border-[var(--bm-accent)] text-[var(--bm-accent)]'
                    : 'border-transparent text-[color:var(--bm-muted)] hover:text-[var(--bm-fg)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="hidden h-9 w-[min(28rem,42vw)] items-center gap-2 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 text-sm text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[var(--bm-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] md:inline-flex"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              title="Command palette (Ctrl/⌘ K)"
            >
              <SearchIcon className="size-4" />
              <span className="flex-1 text-left font-mono">Search…</span>
              <kbd className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-2 py-0.5 font-mono text-xs text-[color:var(--bm-muted)]">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] md:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              title="Search (Ctrl/⌘ K)"
            >
              <SearchIcon className="size-4" />
            </button>

            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              onClick={() => theme.cycle()}
              title={`Theme: ${theme.mode}`}
              aria-label="Cycle theme"
            >
              {theme.resolved === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            </button>
          </div>
        </div>

        {offline ? (
          <div className="border-t border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-4 py-2 text-xs text-[color:var(--bm-muted)]">
            Offline — showing cached content
          </div>
        ) : null}
      </header>

      <TocDrawer />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} isManPage={isManPage} />
      <ReadingPrefsDrawer open={prefsOpen} onOpenChange={setPrefsOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:pb-10 outline-none">
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
          <div className="flex items-center gap-4">
            <Link href={withDistro('/licenses', distro.distro)} className="underline underline-offset-4">
              Licenses
            </Link>
            <a
              href="https://github.com/amanthanvi/BetterMan"
              className="underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <MobileBottomNav />
    </div>
  )
}
