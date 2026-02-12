'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function parsePaletteInput(raw: string): { mode: PaletteMode; text: string } {
  if (raw.startsWith('\\>')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('\\#')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('>')) return { mode: 'actions', text: raw.slice(1) }
  if (raw.startsWith('#')) return { mode: 'headings', text: raw.slice(1) }
  return { mode: 'search', text: raw }
}

function parseSearchText(raw: string): ParsedSearch {
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
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

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
      detail: `Current: ${theme.mode}`,
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

      if (e.key === 'Tab') {
        const canPreview = window.matchMedia('(min-width: 640px)').matches && Boolean(previewRef.current)
        if (canPreview) {
          const activeEl = document.activeElement

          if (e.shiftKey) {
            if (activeEl === previewRef.current) {
              e.preventDefault()
              inputRef.current?.focus()
            }
            return
          }

          if (activeEl === inputRef.current || activeEl === resultsRef.current) {
            e.preventDefault()
            previewRef.current?.focus()
            return
          }
        }
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

  const renderPreview = (item: PaletteItem | undefined) => {
    if (!item) {
      return <div className="text-[13px] text-[color:var(--bm-muted)]">No selection.</div>
    }

    if (item.kind === 'page') {
      const snippet = item.highlights?.filter(Boolean).slice(0, 2).join('\n').trim()

      return (
        <div className="space-y-3">
          <div>
            <div className="font-mono text-[13px] font-semibold text-[color:var(--bm-fg)]">{itemLabel(item)}</div>
            {item.title ? <div className="mt-1 text-[11px] text-[color:var(--bm-muted)]">{item.title}</div> : null}
            <div className="mt-2 text-[13px] leading-snug text-[color:var(--bm-muted)]">{item.description}</div>
          </div>

          {snippet ? (
            <pre className="overflow-x-auto rounded-md border border-[var(--bm-border)] bg-[#0d0d0d] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--bm-fg)]" tabIndex={0}>
              {snippet}
            </pre>
          ) : (
            <div className="text-[11px] text-[color:var(--bm-muted)]">Press Enter to view details.</div>
          )}

          {item.distro && item.distro !== 'debian' ? (
            <div className="font-mono text-[11px] text-[color:var(--bm-muted)]">@{item.distro}</div>
          ) : null}
        </div>
      )
    }

    if (item.kind === 'search') {
      return (
        <div className="space-y-2">
          <div className="font-mono text-[13px] font-semibold text-[color:var(--bm-fg)]">{itemLabel(item)}</div>
          {item.distro && item.distro !== 'debian' ? <div className="font-mono text-[11px] text-[color:var(--bm-muted)]">@{item.distro}</div> : null}
          <div className="text-[11px] text-[color:var(--bm-muted)]">Press Enter to search.</div>
        </div>
      )
    }

    if (item.kind === 'heading') {
      return (
        <div className="space-y-2">
          <div className="font-mono text-[13px] font-semibold text-[color:var(--bm-fg)]">{item.title}</div>
          <div className="font-mono text-[11px] text-[color:var(--bm-muted)]">Level {item.level}</div>
          <div className="text-[11px] text-[color:var(--bm-muted)]">Press Enter to jump.</div>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <div className="font-mono text-[13px] font-semibold text-[color:var(--bm-fg)]">{item.label}</div>
        {item.detail ? <div className="font-mono text-[11px] text-[color:var(--bm-muted)]">{item.detail}</div> : null}
        <div className="text-[11px] text-[color:var(--bm-muted)]">Press Enter to run.</div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-end justify-center pb-[env(safe-area-inset-bottom)] sm:items-center sm:pb-0"
    >
      <div className="absolute inset-0 bg-black/60" onClick={() => close()} />
      <div
        ref={dialogRef}
        className="relative w-full overflow-hidden rounded-t-[var(--bm-radius-lg)] border border-[var(--bm-border-accent)] bg-[var(--bm-surface-2)] sm:w-[min(94vw,56rem)] sm:rounded-[var(--bm-radius-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--bm-border)] p-3">
          <div aria-live="polite" className="sr-only">
            {searchState.status === 'loading'
              ? 'Searching'
              : parsed.text.trim()
                ? items.length
                  ? `${items.length} results`
                  : 'No matches'
                : ''}
          </div>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Search… (use > for actions, # for headings, @distro)"
            className="h-10 w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-bg)] px-3 font-mono text-[13px] text-[color:var(--bm-fg)] outline-none placeholder:text-[color:var(--bm-muted)] focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Command palette input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls="bm-palette-list"
            aria-activedescendant={items.length ? `bm-palette-option-${safeActiveIndex}` : undefined}
          />
        </div>

        <div className="flex max-h-[60vh]">
          <div className="w-full border-r border-[var(--bm-border)] sm:w-[60%]">
            <div
              ref={resultsRef}
              className="max-h-[60vh] overflow-y-auto p-2 outline-none"
              tabIndex={0}
              role="region"
              aria-label="Command palette results"
            >
              {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'loading' ? (
                <div className="p-3 text-[13px] text-[color:var(--bm-muted)]">Searching…</div>
              ) : null}

              {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'error' ? (
                <div className="p-3 text-[13px] text-[color:var(--bm-muted)]">Search failed.</div>
              ) : null}

              {!items.length && parsed.text.trim() ? (
                <div className="p-3 text-[13px] text-[color:var(--bm-muted)]">No matches.</div>
              ) : null}

              <div id="bm-palette-list" role="listbox" className="space-y-1">
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
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        activeRow
                          ? 'border-[var(--bm-border-accent)] bg-[var(--bm-surface-3)] text-[color:var(--bm-fg)]'
                          : 'border-transparent text-[color:var(--bm-muted)] hover:bg-[var(--bm-surface-3)] hover:text-[color:var(--bm-fg)]'
                      }`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => item.run()}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 font-mono text-[13px] font-semibold text-[color:var(--bm-fg)]">
                          {item.kind === 'action' ? `> ${item.label}` : item.kind === 'heading' ? `# ${item.title}` : itemLabel(item)}
                        </div>
                        {bookmark ? <div className="text-[11px] text-[color:var(--bm-muted)]">★</div> : null}
                      </div>
                      {item.kind === 'page' ? (
                        <div className="mt-1 truncate text-[11px] text-[color:var(--bm-muted)]">{item.description}</div>
                      ) : item.kind === 'action' && item.detail ? (
                        <div className="mt-1 truncate text-[11px] text-[color:var(--bm-muted)]">{item.detail}</div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div
            ref={previewRef}
            className="hidden max-h-[60vh] w-[40%] overflow-y-auto p-3 outline-none sm:block"
            tabIndex={0}
            role="region"
            aria-label="Command palette preview"
          >
            {renderPreview(active)}
          </div>
        </div>
      </div>
    </div>
  )
}
