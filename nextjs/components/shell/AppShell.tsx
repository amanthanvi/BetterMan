'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'

import type { InfoResponse } from '../../lib/api'
import { BOOKMARK_TOGGLE_EVENT } from '../../lib/bookmarks'
import { FIND_REQUEST_EVENT, singleKeyShortcutsBlocked } from '../../lib/dom'
import { withDistro, type Distro } from '../../lib/distro'
import { getScrollBehavior, READER_INPUT_EVENTS } from '../../lib/scroll'
import { formatRelativeTime } from '../../lib/time'
import { parseReleaseId } from '../../lib/release'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { MoonIcon, SearchIcon, SunIcon } from '../icons'
import { Kbd } from '../ui/Kbd'

// Shares one in-flight import between the idle preload and an open. A failed
// chunk load (deploy skew, flaky network) is forgotten so the next call refetches.
function retryingImport<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = null
      throw err
    })
    return pending
  }
}

const overlayLoaders = {
  palette: retryingImport(() => import('../palette/CommandPalette').then((m) => m.CommandPalette)),
  prefs: retryingImport(() => import('../reading/ReadingPrefsDrawer').then((m) => m.ReadingPrefsDrawer)),
  shortcuts: retryingImport(() => import('./ShortcutsDialog').then((m) => m.ShortcutsDialog)),
  toc: retryingImport(() => import('../toc/TocDrawer').then((m) => m.TocDrawer)),
}

// About two seconds of frames to wait for a hash target behind a loading boundary.
const HASH_TARGET_MAX_FRAMES = 120

function isElementVisible(el: HTMLElement) {
  return el.getClientRects().length > 0
}

// An overlay's component arrives on first open and then stays mounted so its exit
// transition runs. No React.lazy: that would cache a failed load for the life of the
// page and throw it into the nearest error boundary. Here a failure closes the
// overlay and reports it, and the next open imports again.
function useOverlay<P>(
  load: () => Promise<ComponentType<P>>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  onLoadError: () => void,
) {
  const [Overlay, setOverlay] = useState<ComponentType<P> | null>(null)

  useEffect(() => {
    if (!open || Overlay) return
    let cancelled = false
    load().then(
      (component) => {
        if (!cancelled) setOverlay(() => component)
      },
      () => {
        if (cancelled) return
        onOpenChange(false)
        onLoadError()
      },
    )
    return () => {
      cancelled = true
    }
  }, [Overlay, load, onLoadError, onOpenChange, open])

  return Overlay
}

function dashboardHref(section: 'recent' | 'bookmarks', urlDistro: Distro | null) {
  return `${withDistro('/', urlDistro)}#${section}`
}

export function AppShell({ children }: { children: React.ReactNode }) {
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
  const [overlayNotice, setOverlayNotice] = useState('')
  const onOverlayLoadError = useCallback(() => setOverlayNotice('Could not open. Try again.'), [])
  const CommandPalette = useOverlay(overlayLoaders.palette, paletteOpen, setPaletteOpen, onOverlayLoadError)
  const ShortcutsDialog = useOverlay(overlayLoaders.shortcuts, shortcutsOpen, setShortcutsOpen, onOverlayLoadError)
  const ReadingPrefsDrawer = useOverlay(overlayLoaders.prefs, prefsOpen, setPrefsOpen, onOverlayLoadError)
  const TocDrawer = useOverlay(overlayLoaders.toc, toc.open, setTocOpen, onOverlayLoadError)
  const anyOverlayOpen = paletteOpen || shortcutsOpen || prefsOpen || toc.open

  // Clearing on open lets the same notice be announced again after the next failure.
  useEffect(() => {
    if (anyOverlayOpen) setOverlayNotice('')
  }, [anyOverlayOpen])

  const lastRouteKeyRef = useRef<string | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  // Route key of the last back/forward. A same-route pop (hash only) never runs the
  // route effect, so a boolean would stay set and mislabel the next push as a pop.
  const popRouteKeyRef = useRef<string | null>(null)

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
    // Fetch the overlay chunks once the page is idle, so a first open is immediate and works offline.
    const preload = () => {
      Promise.all(Object.values(overlayLoaders).map((load) => load())).catch(() => {
        // Opening the overlay tries again.
      })
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(preload, 3000)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onPop = () => {
      popRouteKeyRef.current = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`
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

    const wasPop = popRouteKeyRef.current === routeKey
    const nextY = wasPop ? scrollPositionsRef.current.get(routeKey) ?? 0 : 0
    popRouteKeyRef.current = null
    lastRouteKeyRef.current = routeKey

    setTocOpen(false)
    window.scrollTo({ top: nextY, left: 0, behavior: 'auto' })

    // Push navigations to `/#recent` and similar land on the hash target. The new
    // page may still be behind a loading boundary, so wait briefly for the element.
    // Pop navigations restore the saved scroll, including zero, and must not jump.
    if (wasPop || !prevKey || window.location.hash.length < 2) return
    let id: string
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return
    }
    let frame = 0
    let attempts = 0
    const stop = () => {
      window.cancelAnimationFrame(frame)
      for (const type of READER_INPUT_EVENTS) window.removeEventListener(type, stop)
    }
    const tick = () => {
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' })
        stop()
      } else if (++attempts < HASH_TARGET_MAX_FRAMES) {
        frame = window.requestAnimationFrame(tick)
      } else {
        stop()
      }
    }
    // A slow boundary must not yank a reader who has already started scrolling.
    for (const type of READER_INPUT_EVENTS) window.addEventListener(type, stop, { passive: true })
    tick()
    return stop
  }, [routeKey, setTocOpen])

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!(main instanceof HTMLElement)) return
    main.focus({ preventScroll: true })
  }, [routeKey])

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

      if (singleKeyShortcutsBlocked(document)) return

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
          behavior: getScrollBehavior(),
        })
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        router.push(dashboardHref('recent', distro.urlDistro))
        return
      }

      if (isManPage && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPrefsOpen(true)
        return
      }

      if (isManPage && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(FIND_REQUEST_EVENT))
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
  }, [distro, isManPage, router, theme, toc])

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
          <a href={withDistro('/', distro.urlDistro)} className="inline-flex items-center gap-2 text-fg hover:text-fg hover:no-underline">
            <span className="font-mono text-sm font-semibold tracking-tight text-accent">&gt;_</span>
            <span className="text-sm font-semibold tracking-tight">BetterMan</span>
          </a>

          <div aria-live="polite" className="sr-only">
            {themeAnnouncement}
          </div>
          <div aria-live="polite" className="sr-only">
            {overlayNotice}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              className="group inline-flex h-9 items-center justify-center gap-2 px-1 text-muted transition-colors hover:text-fg"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search ⌘K"
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

      {TocDrawer ? <TocDrawer /> : null}
      {ShortcutsDialog ? <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} isManPage={isManPage} /> : null}
      {ReadingPrefsDrawer ? <ReadingPrefsDrawer open={prefsOpen} onOpenChange={setPrefsOpen} /> : null}
      {CommandPalette ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-10 pb-10 outline-none">
        {children}
      </main>

      <footer data-bm-app-footer aria-label="Site footer" className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-mono">
            <span aria-hidden="true" className="text-accent">&gt;_</span>
            {info ? (
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
              href={withDistro('/licenses', distro.urlDistro)}
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
