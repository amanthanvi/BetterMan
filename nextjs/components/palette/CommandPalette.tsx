'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

import type { SearchResponse, SearchResult } from '../../lib/api'
import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, getBookmarks } from '../../lib/bookmarks'
import { clearRecent, getRecent, recordRecentSearch, type RecentItem } from '../../lib/recent'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { normalizeDistro, withDistro, type Distro } from '../../lib/distro'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { isTypingTarget } from '../../lib/dom'
import { useDistro } from '../state/distro'
import { useTheme } from '../state/theme'
import { useToc } from '../state/toc'
import { Kbd } from '../ui/Kbd'

type PaletteMode = 'search' | 'actions' | 'headings'

type PaletteItem =
  | {
      kind: 'action'
      id: string
      label: string
      detail?: string
      run: () => void
    }
  | {
      kind: 'page'
      id: string
      name: string
      section: string
      title?: string
      description: string
      highlights?: string[]
      distro?: Distro
      run: () => void
    }
  | {
      kind: 'search'
      id: string
      query: string
      distro?: Distro
      run: () => void
    }
  | {
      kind: 'heading'
      id: string
      title: string
      level: number
      run: () => void
    }

type ActionItem = Extract<PaletteItem, { kind: 'action' }>

type ParsedSearch = { distro?: Distro; text: string }

export function parsePaletteInput(raw: string): { mode: PaletteMode; text: string } {
  if (raw.startsWith('\\>')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('\\#')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('>')) return { mode: 'actions', text: raw.slice(1) }
  if (raw.startsWith('#')) return { mode: 'headings', text: raw.slice(1) }
  return { mode: 'search', text: raw }
}

export function parseSearchText(raw: string): ParsedSearch {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('@')) return { text: trimmed }

  const spaceIdx = trimmed.indexOf(' ')
  const token = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).slice(1)
  const distro = normalizeDistro(token)
  if (!distro) return { text: trimmed }

  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)
  return { distro, text: rest.trim() }
}

function recentToItems(
  recent: RecentItem[],
  ctx: { runSearch: (q: string, distroOverride?: Distro) => void; runMan: (name: string, section: string, distroOverride?: Distro) => void },
): PaletteItem[] {
  return recent.slice(0, 12).map((r) => {
    if (r.kind === 'search') {
      return {
        kind: 'search' as const,
        id: `search:${r.query}`,
        query: r.query,
        distro: parseSearchText(r.query).distro,
        run: () => ctx.runSearch(r.query, parseSearchText(r.query).distro),
      }
    }
    return {
      kind: 'page' as const,
      id: `page:${r.name}:${r.section}`,
      name: r.name,
      section: r.section,
      description: r.description ?? '',
      run: () => ctx.runMan(r.name, r.section),
    }
  })
}

function bookmarksToItems(
  bookmarks: Array<{ name: string; section: string; description?: string }>,
  ctx: { runMan: (name: string, section: string, distroOverride?: Distro) => void },
): PaletteItem[] {
  return bookmarks.slice(0, 10).map((b) => ({
    kind: 'page' as const,
    id: `bookmark:${b.name}:${b.section}`,
    name: b.name,
    section: b.section,
    description: b.description ?? '',
    run: () => ctx.runMan(b.name, b.section),
  }))
}

function resultToItem(result: SearchResult, ctx: { query: string; distro: Distro; runMan: (name: string, section: string, distroOverride?: Distro) => void }): PaletteItem {
  return {
    kind: 'page',
    id: `page:${result.name}:${result.section}`,
    name: result.name,
    section: result.section,
    title: result.title,
    description: result.description,
    highlights: result.highlights,
    distro: ctx.distro,
    run: () => {
      recordRecentSearch(ctx.query)
      ctx.runMan(result.name, result.section, ctx.distro)
    },
  }
}

function itemLabel(item: PaletteItem) {
  switch (item.kind) {
    case 'action':
      return item.label
    case 'search':
      return `Search: ${item.query}`
    case 'page':
      return `${item.name}(${item.section})`
    case 'heading':
      return item.title
  }
}

function dedupePages(items: PaletteItem[]): PaletteItem[] {
  const seen = new Set<string>()
  const out: PaletteItem[] = []
  for (const item of items) {
    if (item.kind !== 'page') {
      out.push(item)
      continue
    }
    const key = `${item.name}:${item.section}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const distro = useDistro()
  const theme = useTheme()
  const toc = useToc()

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [input, setInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const parsed = useMemo(() => parsePaletteInput(input), [input])
  const parsedSearch = useMemo(() => (parsed.mode === 'search' ? parseSearchText(parsed.text) : { text: parsed.text.trim() }), [parsed.mode, parsed.text])
  const effectiveDistro = parsed.mode === 'search' && parsedSearch.distro ? parsedSearch.distro : distro.distro
  const debouncedQuery = useDebouncedValue(parsed.mode === 'search' ? parsedSearch.text : parsed.text.trim(), 120)

  const [bookmarkSet, setBookmarkSet] = useState<Set<string>>(() => new Set())

  const [searchState, setSearchState] = useState<{ status: 'idle' | 'loading' | 'error' | 'success'; data?: SearchResponse }>({
    status: 'idle',
  })

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const runSearch = (q: string, distroOverride?: Distro) => {
    const query = q.trim()
    if (!query) return
    recordRecentSearch(query)
    const targetDistro = distroOverride ?? effectiveDistro
    router.push(withDistro(`/search?q=${encodeURIComponent(query)}`, targetDistro))
    close()
  }

  const runMan = (name: string, section: string, distroOverride?: Distro) => {
    const targetDistro = distroOverride ?? effectiveDistro
    router.push(withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, targetDistro))
    close()
  }

  useEffect(() => {
    if (!open) return
    const sync = () => setBookmarkSet(new Set(getBookmarks().items.map((it) => `${it.name}:${it.section}`)))
    sync()

    const bump = () => sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BOOKMARKS_STORAGE_KEY) return
      bump()
    }

    window.addEventListener(BOOKMARKS_EVENT, bump)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(BOOKMARKS_EVENT, bump)
      window.removeEventListener('storage', onStorage)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useFocusTrap(open, dialogRef)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open || parsed.mode !== 'search') return
    if (!debouncedQuery) {
      setSearchState({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    setSearchState({ status: 'loading' })

    const params = new URLSearchParams()
    params.set('q', debouncedQuery)
    params.set('limit', '10')
    params.set('offset', '0')
    if (effectiveDistro !== 'debian') params.set('distro', effectiveDistro)

    void fetch(`/api/v1/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as SearchResponse
      })
      .then((payload) => setSearchState({ status: 'success', data: payload }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSearchState({ status: 'error' })
      })

    return () => controller.abort()
  }, [debouncedQuery, effectiveDistro, open, parsed.mode])

  const sectionActions: ActionItem[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((s) => ({
    kind: 'action',
    id: `action-section-${s}`,
    label: `Go to section ${s}`,
    run: () => {
      router.push(withDistro(`/section/${encodeURIComponent(s)}`, effectiveDistro))
      close()
    },
  }))

  const baseActions: ActionItem[] = [
    {
      kind: 'action',
      id: 'action-theme',
      label: 'Toggle theme',
      detail: 'Cycle: system → light → dark',
      run: () => theme.cycle(),
    },
    {
      kind: 'action',
      id: 'action-home',
      label: 'Go home',
      run: () => {
        router.push('/')
        close()
      },
    },
    ...sectionActions,
    {
      kind: 'action',
      id: 'action-clear-recent',
      label: 'Clear recent history',
      run: () => {
        clearRecent()
        setInput('')
        setActiveIndex(0)
      },
    },
  ]

  const items: PaletteItem[] = (() => {
    if (parsed.mode === 'actions') {
      const q = parsed.text.trim().toLowerCase()
      if (!q) return baseActions
      return baseActions.filter((a) => a.label.toLowerCase().includes(q))
    }

    if (parsed.mode === 'headings') {
      const q = parsed.text.trim().toLowerCase()
      const matches = (q ? toc.items.filter((t) => t.title.toLowerCase().includes(q)) : toc.items).slice(0, 30)
      return matches.map((t) => ({
        kind: 'heading',
        id: `heading:${t.id}`,
        title: t.title,
        level: t.level,
        run: () => {
          const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          document.getElementById(t.id)?.scrollIntoView({ behavior, block: 'start' })
          window.location.hash = t.id
          close()
        },
      }))
    }

    const q = parsed.text.trim()
    if (!q) {
      const bookmarkItems = bookmarksToItems(getBookmarks().items, { runMan })
      const recentItems = recentToItems(getRecent(), { runSearch, runMan })
      return dedupePages([...recentItems, ...bookmarkItems])
    }

    if (searchState.status !== 'success' || !searchState.data) return []
    return searchState.data.results.map((r) => resultToItem(r, { query: q, distro: effectiveDistro, runMan }))
  })()

  const safeActiveIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0
  const active = items[safeActiveIndex]

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }

      if (isTypingTarget(document.activeElement) && document.activeElement !== inputRef.current) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        active?.run()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, close, items.length, open])

  useEffect(() => {
    if (!open) return
    if (!items.length) return
    const el = document.getElementById(`bm-palette-option-${safeActiveIndex}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [items.length, open, safeActiveIndex])

  if (!open) return null

  const modeHint = parsed.mode === 'actions' ? 'Actions' : parsed.mode === 'headings' ? 'Headings' : null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-end justify-center pb-[env(safe-area-inset-bottom)] sm:items-start sm:pt-[16vh] sm:pb-0"
    >
      <div className="absolute inset-0 bg-scrim" onClick={() => close()} />
      <div
        ref={dialogRef}
        className="relative flex w-full max-h-[70vh] flex-col overflow-hidden rounded-t-lg border border-edge bg-raised shadow-lg shadow-black/25 sm:max-h-[60vh] sm:w-[min(94vw,40rem)] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-edge p-3">
          <div aria-live="polite" className="sr-only">
            {searchState.status === 'loading'
              ? 'Searching'
              : parsed.text.trim()
                ? items.length
                  ? `${items.length} results`
                  : 'No matches'
                : ''}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              name="bm-palette"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setActiveIndex(0)
              }}
              placeholder="Search man pages…"
              className="h-10 w-full min-w-0 flex-1 rounded-md border border-edge bg-bg px-3 font-mono text-sm text-fg outline-none placeholder:text-muted"
              aria-label="Command palette input"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={true}
              aria-controls="bm-palette-list"
              aria-activedescendant={items.length ? `bm-palette-option-${safeActiveIndex}` : undefined}
            />
            {modeHint ? (
              <span className="shrink-0 rounded-sm border border-accent-edge bg-accent-subtle px-2 py-1 font-mono text-xs text-fg">
                {modeHint}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2" role="region" aria-label="Command palette results">
          {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'loading' ? (
            <div className="p-3 text-sm text-muted">Searching…</div>
          ) : null}

          {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'error' ? (
            <div className="p-3 text-sm text-muted">Search failed.</div>
          ) : null}

          {!items.length && parsed.text.trim() ? <div className="p-3 text-sm text-muted">No matches.</div> : null}

          <div id="bm-palette-list" role="listbox" className="space-y-0.5">
            {items.map((item, idx) => {
              const activeRow = idx === safeActiveIndex
              const bookmark = item.kind === 'page' ? bookmarkSet.has(`${item.name}:${item.section}`) : false

              return (
                <div
                  key={item.id}
                  id={`bm-palette-option-${idx}`}
                  role="option"
                  aria-selected={activeRow}
                  tabIndex={-1}
                  className={`w-full cursor-pointer rounded-md px-3 py-2 text-left transition-colors ${
                    activeRow ? 'bg-accent-subtle text-fg' : 'text-muted hover:bg-bg hover:text-fg'
                  }`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => item.run()}
                >
                  <div className="flex items-baseline gap-3">
                    <div className="min-w-0 shrink-0 font-mono text-sm font-semibold text-fg">
                      {item.kind === 'action' ? `> ${item.label}` : item.kind === 'heading' ? `# ${item.title}` : itemLabel(item)}
                    </div>
                    {item.kind === 'page' ? (
                      <div className="min-w-0 flex-1 truncate text-sm text-muted">{item.description}</div>
                    ) : item.kind === 'action' && item.detail ? (
                      <div className="min-w-0 flex-1 truncate text-sm text-muted">{item.detail}</div>
                    ) : null}
                    {bookmark ? <div className="shrink-0 text-xs text-muted">★</div> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
          <span className="ml-auto hidden font-mono text-faint sm:inline">&gt; actions · # headings · @distro</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
