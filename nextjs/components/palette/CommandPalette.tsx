'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { SearchResponse, SearchResult } from '../../lib/api'
import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, getBookmarks } from '../../lib/bookmarks'
import { clearRecent, getRecent, recordRecentSearch, type RecentItem } from '../../lib/recent'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
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
      description: string
      run: () => void
    }
  | {
      kind: 'search'
      id: string
      query: string
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

function parsePaletteInput(raw: string): { mode: PaletteMode; text: string } {
  if (raw.startsWith('\\>')) return { mode: 'search', text: raw.slice(1) }
  if (raw.startsWith('\\#')) return { mode: 'search', text: raw.slice(1) }
  if (raw.startsWith('>')) return { mode: 'actions', text: raw.slice(1) }
  if (raw.startsWith('#')) return { mode: 'headings', text: raw.slice(1) }
  return { mode: 'search', text: raw }
}

function withDistro(path: string, distro: string): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
}

function isTypingTarget(el: Element | null) {
  if (!el) return false
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range'].includes(el.type)
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement) return el.isContentEditable
  return false
}

function recentToItems(recent: RecentItem[], ctx: { runSearch: (q: string) => void; runMan: (name: string, section: string) => void }) {
  return recent.slice(0, 12).map((r) => {
    if (r.kind === 'search') {
      return {
        kind: 'search' as const,
        id: `search:${r.query}`,
        query: r.query,
        run: () => ctx.runSearch(r.query),
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

function bookmarksToItems(bookmarks: Array<{ name: string; section: string; description?: string }>, ctx: { runMan: (name: string, section: string) => void }) {
  return bookmarks.slice(0, 10).map((b) => ({
    kind: 'page' as const,
    id: `bookmark:${b.name}:${b.section}`,
    name: b.name,
    section: b.section,
    description: b.description ?? '',
    run: () => ctx.runMan(b.name, b.section),
  }))
}

function resultToItem(
  result: SearchResult,
  ctx: { query: string; runMan: (name: string, section: string) => void },
): PaletteItem {
  return {
    kind: 'page',
    id: `page:${result.name}:${result.section}`,
    name: result.name,
    section: result.section,
    description: result.description,
    run: () => {
      recordRecentSearch(ctx.query)
      ctx.runMan(result.name, result.section)
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

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const distro = useDistro()
  const theme = useTheme()
  const toc = useToc()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [input, setInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const parsed = useMemo(() => parsePaletteInput(input), [input])
  const debouncedQuery = useDebouncedValue(parsed.text.trim(), 120)
  const [bookmarkSet, setBookmarkSet] = useState<Set<string>>(() => new Set())

  const [searchState, setSearchState] = useState<{ status: 'idle' | 'loading' | 'error' | 'success'; data?: SearchResponse }>({
    status: 'idle',
  })

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const runSearch = (q: string) => {
    const query = q.trim()
    if (!query) return
    recordRecentSearch(query)
    router.push(withDistro(`/search?q=${encodeURIComponent(query)}`, distro.distro))
    close()
  }

  const runMan = (name: string, section: string) => {
    router.push(withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, distro.distro))
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
    if (distro.distro !== 'debian') params.set('distro', distro.distro)

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
  }, [debouncedQuery, distro.distro, open, parsed.mode])

  const sectionActions: ActionItem[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((s) => ({
    kind: 'action',
    id: `action-section-${s}`,
    label: `Go to section ${s}`,
    run: () => {
      router.push(withDistro(`/section/${encodeURIComponent(s)}`, distro.distro))
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
    {
      kind: 'action',
      id: 'action-history',
      label: 'Go to history',
      run: () => {
        router.push('/history')
        close()
      },
    },
    {
      kind: 'action',
      id: 'action-bookmarks',
      label: 'Go to bookmarks',
      run: () => {
        router.push('/bookmarks')
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
      const bookmarks = getBookmarks().items
      return [
        ...bookmarksToItems(bookmarks, { runMan }),
        ...recentToItems(getRecent(), { runSearch, runMan }),
        ...baseActions,
      ]
    }
    if (searchState.status !== 'success' || !searchState.data) return []
    return searchState.data.results.map((r) => resultToItem(r, { query: q, runMan }))
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

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50"
      onMouseDown={() => close()}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative mx-auto mt-20 w-[min(92vw,44rem)] overflow-hidden rounded-xl border border-[var(--bm-border)] bg-[var(--bm-bg)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-[var(--bm-border)] p-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Search… (use > for actions, # for headings)"
            className="w-full rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Command palette input"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'loading' ? (
            <div className="p-3 text-sm text-[color:var(--bm-muted)]">Searching…</div>
          ) : null}

          {parsed.mode === 'search' && parsed.text.trim() && searchState.status === 'error' ? (
            <div className="p-3 text-sm text-[color:var(--bm-muted)]">Search failed.</div>
          ) : null}

          {!items.length && parsed.text.trim() ? (
            <div className="p-3 text-sm text-[color:var(--bm-muted)]">No matches.</div>
          ) : null}

          <ol className="space-y-1">
            {items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    idx === safeActiveIndex
                      ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
                      : 'text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.8] hover:text-[color:var(--bm-fg)]'
                  }`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => item.run()}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-[color:var(--bm-fg)]">{itemLabel(item)}</div>
                    {item.kind === 'page' && bookmarkSet.has(`${item.name}:${item.section}`) ? (
                      <div className="text-xs text-[color:var(--bm-muted)]">★</div>
                    ) : item.kind === 'action' && item.detail ? (
                      <div className="text-xs text-[color:var(--bm-muted)]">{item.detail}</div>
                    ) : null}
                  </div>
                  {item.kind === 'page' ? (
                    <div className="mt-1 text-xs text-[color:var(--bm-muted)]">{item.description}</div>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
