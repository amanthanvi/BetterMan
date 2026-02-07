'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { InfoResponse } from '../../lib/api'
import { DISTRO_LABEL, DISTROS, normalizeDistro } from '../../lib/distro'
import { formatRelativeTime } from '../../lib/time'
import { CommandPalette } from '../palette/CommandPalette'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { TocDrawer } from '../toc/TocDrawer'
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
  const searchRef = useRef<HTMLInputElement | null>(null)

  const lastRouteKeyRef = useRef<string | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const isPopRef = useRef(false)

  const routeKey = `${pathname}?${searchParams.toString()}`

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

          <select
            value={distro.distro}
            onChange={(e) => {
              const next = normalizeDistro(e.target.value)
              if (next) distro.setDistro(next)
            }}
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-2 text-xs font-medium text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-surface)/0.9] sm:text-sm"
            aria-label="Select distribution"
          >
            {DISTROS.map((d) => (
              <option key={d} value={d}>
                {DISTRO_LABEL[d]}
              </option>
            ))}
          </select>

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
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} isManPage={pathname.startsWith('/man/')} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>

      <footer data-bm-app-footer className="border-t border-[var(--bm-border)]">
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
    </div>
  )
}
