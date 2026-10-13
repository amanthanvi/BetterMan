'use client'

import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { InfoResponse } from '../../lib/api'
import { BOOKMARK_TOGGLE_EVENT } from '../../lib/bookmarks'
import { isTypingTarget } from '../../lib/dom'
import type { Distro } from '../../lib/distro'
import { withDistro } from '../../lib/distro'
import { getScrollBehavior } from '../../lib/scroll'
import { formatRelativeTime } from '../../lib/time'
import { parseReleaseId } from '../../lib/release'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { MoonIcon, SearchIcon, SunIcon } from '../icons'
import { Kbd } from '../ui/Kbd'

// Rarely-used overlays load on first open instead of in the initial bundle.
const CommandPalette = dynamic(() => import('../palette/CommandPalette').then((m) => m.CommandPalette))
const ReadingPrefsDrawer = dynamic(() => import('../reading/ReadingPrefsDrawer').then((m) => m.ReadingPrefsDrawer))
const ShortcutsDialog = dynamic(() => import('./ShortcutsDialog').then((m) => m.ShortcutsDialog))
const TocDrawer = dynamic(() => import('../toc/TocDrawer').then((m) => m.TocDrawer))

function isElementVisible(el: HTMLElement) {
  return el.getClientRects().length > 0
}

function dashboardHref(section: 'recent' | 'bookmarks', distro: string) {
  return `${withDistro('/', distro)}#${section}`
}

export function AppShell({
  children,
  initialInfo,
}: {
  children: React.ReactNode
  /** Server-fetched footer info for the cookie distro; avoids a client round trip on first load. */
  initialInfo?: { distro: Distro; info: InfoResponse } | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const distro = useDistro()
  const theme = useTheme()
  const toc = useToc()
  const setTocOpen = toc.setOpen
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const [themeAnnouncement, setThemeAnnouncement] = useState('')
  const themeAnnouncementMountedRef = useRef(false)

  // Mount each lazy overlay only after it is first needed; they stay mounted
  // afterwards so their open/close transitions keep working.
  const [paletteMounted, setPaletteMounted] = useState(false)
  const [shortcutsMounted, setShortcutsMounted] = useState(false)
  const [prefsMounted, setPrefsMounted] = useState(false)

  const lastRouteKeyRef = useRef<string | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const isPopRef = useRef(false)

  const routeKey = `${pathname}?${searchParams.toString()}`
  const routeParts = pathname.split('/').filter(Boolean)
  const isManPage = routeParts[0] === 'man' && routeParts.length >= 3

  const [info, setInfo] = useState<InfoResponse | null>(initialInfo?.info ?? null)
  // The distro the current `info` belongs to — the footer only shows data
  // for the active distro (never another distro's counts while a refetch
  // is in flight after a switch).
  const [infoFor, setInfoFor] = useState<Distro | null>(initialInfo?.distro ?? null)
  // Footer info text renders only after hydration: relative-time and number
  // formatting use the runtime locale/clock, so SSR text could mismatch.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    // The layout already fetched info for this distro; only refetch on switch,
    // and restore the SSR info when switching back to it.
    if (initialInfo && distro.distro === initialInfo.distro) {
      setInfo(initialInfo.info)
      setInfoFor(initialInfo.distro)
      return
    }

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
      .then((payload) => {
        if (controller.signal.aborted) return
        setInfo(payload)
        setInfoFor(distro.distro)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setInfo(null)
        setInfoFor(null)
      })

    return () => controller.abort()
  }, [distro.distro, initialInfo])

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

    setTocOpen(false)

    // Honor hash targets on push navigations (e.g. `h` → /#recent) instead of
    // always resetting to the top.
    let hashTarget: HTMLElement | null = null
    if (!nextY && window.location.hash.length > 1) {
      try {
        hashTarget = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      } catch {
        hashTarget = null
      }
    }
    if (hashTarget) {
      hashTarget.scrollIntoView({ behavior: 'auto', block: 'start' })
    } else {
      window.scrollTo({ top: nextY, left: 0, behavior: 'auto' })
    }
  }, [routeKey, setTocOpen])

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!(main instanceof HTMLElement)) return
    main.focus({ preventScroll: true })
  }, [routeKey])

  const openPalette = () => {
    setPaletteMounted(true)
    setPaletteOpen(true)
  }
  const openShortcuts = () => {
    setShortcutsMounted(true)
    setShortcutsOpen(true)
  }
  const openPrefs = () => {
    setPrefsMounted(true)
    setPrefsOpen(true)
  }

  // Mount the TOC drawer on first use; it stays mounted afterwards.
  const [tocDrawerMounted, setTocDrawerMounted] = useState(false)
  useEffect(() => {
    if (toc.open) setTocDrawerMounted(true)
  }, [toc.open])

  useEffect(() => {
    const EVENT = 'bm:prefs-request'
    const onEvent = () => openPrefs()
    window.addEventListener(EVENT, onEvent)
    return () => window.removeEventListener(EVENT, onEvent)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        // Native find misses virtualized content; route to the custom find bar.
        // Suppressed while an overlay owns focus — never focus behind a modal.
        if (!isManPage) return
        if (paletteOpen || prefsOpen || shortcutsOpen || toc.open) return
        // Only hijack when the custom find bar actually exists on this page
        // (a 404 man route mounts no ManPageView — native find must survive).
        if (!document.querySelector('button[aria-label="Find in page"]')) return
        e.preventDefault()
        try {
          window.dispatchEvent(new CustomEvent('bm:find-request'))
        } catch {
          // ignore
        }
        return
      }

      if (isTypingTarget(document.activeElement)) return

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault()
        openShortcuts()
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

        openPalette()
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
          behavior: getScrollBehavior(),
        })
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        router.push(dashboardHref('recent', distro.distro))
        return
      }

      if (isManPage && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        openPrefs()
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
  }, [distro.distro, isManPage, paletteOpen, prefsOpen, router, shortcutsOpen, theme, toc])

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
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-edge-strong focus:bg-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-fg"
      >
        Skip to content
      </a>
      <header data-bm-app-header aria-label="Site header" className="sticky top-0 z-20 border-b border-edge bg-bg">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href={withDistro('/', distro.distro)} className="inline-flex items-center gap-2 text-fg hover:text-fg hover:no-underline">
            <span className="font-mono text-sm font-semibold tracking-tight text-accent">&gt;_</span>
            <span className="text-sm font-semibold tracking-tight">BetterMan</span>
          </a>

          <div aria-live="polite" className="sr-only">
            {themeAnnouncement}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              className="group inline-flex h-9 items-center justify-center gap-2 px-1 text-muted transition-colors hover:text-fg"
              onClick={() => openPalette()}
              aria-label="Search"
              title="Command palette (Ctrl/⌘ K)"
            >
              <SearchIcon className="size-4" />
              <span className="font-mono text-sm group-hover:underline group-hover:underline-offset-4">
                search
              </span>
              <span className="hidden md:inline-flex">
                <Kbd>⌘K</Kbd>
              </span>
            </button>

            <button
              type="button"
              className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-fg"
              onClick={() => theme.cycle()}
              title="Cycle theme"
              aria-label="Cycle theme"
            >
              <SunIcon className="bm-theme-icon bm-theme-icon-sun size-4" />
              <MoonIcon className="bm-theme-icon bm-theme-icon-moon size-4" />
            </button>
          </div>
        </div>

        {offline ? (
          <div className="border-t border-edge bg-raised px-4 py-2 text-xs text-muted">
            Offline — showing cached content
          </div>
        ) : null}
      </header>

      {tocDrawerMounted ? <TocDrawer /> : null}
      {shortcutsMounted ? <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} isManPage={isManPage} /> : null}
      {prefsMounted ? <ReadingPrefsDrawer open={prefsOpen} onOpenChange={setPrefsOpen} /> : null}
      {paletteMounted ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-10 pb-10 outline-none">
        {children}
      </main>

      <footer data-bm-app-footer aria-label="Site footer" className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-mono">
            <span aria-hidden="true" className="text-accent">&gt;_</span>
            {info && hydrated && infoFor === distro.distro ? (
              <span title={`Dataset ${info.datasetReleaseId}`}>
                {info.pageCount.toLocaleString()} pages · updated {formatRelativeTime(info.lastUpdated)}
                {parseReleaseId(info.datasetReleaseId).mandocVersion
                  ? ` · mandoc ${parseReleaseId(info.datasetReleaseId).mandocVersion}`
                  : ''}
              </span>
            ) : (
              <span>BetterMan</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <a
              href={withDistro('/licenses', distro.distro)}
              className="text-muted underline underline-offset-4 hover:text-fg"
            >
              Licenses
            </a>
            <a
              href="https://github.com/amanthanvi/BetterMan"
              className="text-muted underline underline-offset-4 hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
