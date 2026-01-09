import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'

import { ErrorBoundary } from '../app/ErrorBoundary'
import { TocProvider, useToc } from '../app/toc'
import { ThemeProvider, useTheme } from '../app/theme'
import { fetchInfo } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { formatRelativeTime } from '../lib/time'
import { Toc } from '../man/Toc'
import markUrl from '/betterman-mark.svg?url'

const LazyCommandPalette = lazy(() =>
  import('../app/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl py-14">
      <div className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">404</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-3 text-sm text-[color:var(--bm-muted)]">
          That page doesn&apos;t exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <ThemeProvider>
      <TocProvider>
        <RootLayoutInner />
      </TocProvider>
    </ThemeProvider>
  )
}

function RootLayoutInner() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const lastRouteKeyRef = useRef<string | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const isPopRef = useRef(false)
  const toc = useToc()
  const theme = useTheme()

  const infoQuery = useQuery({
    queryKey: queryKeys.info(),
    queryFn: () => fetchInfo(),
    staleTime: 5 * 60_000,
  })

  const routeKey = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.search}`,
  })
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
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
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [theme, toc])

  return (
    <div className="min-h-dvh bg-[var(--bm-bg)] text-[var(--bm-fg)]">
      <header
        data-bm-app-header
        className="sticky top-0 z-20 border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <img
              src={markUrl}
              alt=""
              className="size-6"
              width={24}
              height={24}
              loading="eager"
              decoding="async"
            />
            BetterMan
          </Link>

          {infoQuery.data ? (
            <div className="hidden items-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65] px-3 py-1 text-xs text-[color:var(--bm-muted)] shadow-sm backdrop-blur md:flex">
              <span className="font-mono text-[color:var(--bm-fg)]">
                {infoQuery.data.datasetReleaseId}
              </span>
              <span aria-hidden="true">·</span>
              <span>{infoQuery.data.pageCount.toLocaleString()} pages</span>
              <span aria-hidden="true">·</span>
              <span>updated {formatRelativeTime(infoQuery.data.lastUpdated)}</span>
            </div>
          ) : null}

          {pathname !== '/' ? (
            <form
              className="hidden flex-1 sm:block"
              onSubmit={(e) => {
                e.preventDefault()
                const query = q.trim()
                if (!query) return
                navigate({ to: '/search', search: { q: query } })
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
          <button
            type="button"
            className="hidden rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-xs font-medium text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.9] sm:block"
            onClick={() => setPaletteOpen(true)}
          >
            Ctrl/⌘ K
          </button>
          <button
            type="button"
            className="hidden items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] sm:inline-flex"
            onClick={() => theme.cycle()}
            title={`Theme: ${theme.mode}`}
          >
            Theme
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] lg:hidden ${
              toc.items.length ? '' : 'invisible pointer-events-none'
            }`}
            onClick={() => toc.setOpen(true)}
            tabIndex={toc.items.length ? 0 : -1}
            aria-hidden={!toc.items.length}
          >
            TOC
          </button>
        </div>
      </header>

      <TocDrawer />
      {paletteOpen ? (
        <Suspense fallback={null}>
          <LazyCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-10">
        <ErrorBoundary key={routeKey}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer data-bm-app-footer className="border-t border-[var(--bm-border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-[color:var(--bm-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[color:var(--bm-fg)]">BetterMan</div>
            {infoQuery.data ? (
              <div className="font-mono text-[10px] sm:text-xs">
                Dataset {infoQuery.data.datasetReleaseId} · {infoQuery.data.pageCount.toLocaleString()} pages · updated{' '}
                {formatRelativeTime(infoQuery.data.lastUpdated)}
              </div>
            ) : null}
          </div>
          <Link to="/licenses" className="underline underline-offset-4">
            Licenses
          </Link>
        </div>
      </footer>
    </div>
  )
}

function TocDrawer() {
  const toc = useToc()

  return (
    <Dialog.Root open={toc.open} onOpenChange={toc.setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-40 w-[min(90vw,24rem)] overflow-y-auto border-r border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold tracking-tight">
              Table of contents
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Jump to a section in this man page.</Dialog.Description>
          <div className="mt-4">
            <Toc
              items={toc.items}
              showTitle={false}
              onNavigate={() => toc.setOpen(false)}
              onNavigateToId={toc.scrollToId ?? undefined}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

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
