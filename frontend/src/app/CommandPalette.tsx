import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { search } from '../api/client'
import type { SearchResult } from '../api/types'
import { clearRecent, getRecent, recordRecentSearch, type RecentItem } from '../lib/recent'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useTheme } from './theme'
import { useToc } from './toc'

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

type NavigateFn = (opts:
  | { to: '/'; replace?: boolean }
  | { to: '/search'; search: { q: string }; replace?: boolean }
  | { to: '/man/$name/$section'; params: { name: string; section: string }; replace?: boolean }
) => void

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const theme = useTheme()
  const navigate = useNavigate()
  const toc = useToc()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [input, setInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  const parsed = parsePaletteInput(input)
  const debouncedQuery = useDebouncedValue(parsed.text.trim(), 120)

  const searchQuery = useQuery({
    queryKey: ['paletteSearch', debouncedQuery],
    enabled: open && parsed.mode === 'search' && debouncedQuery.length > 0,
    queryFn: () => search({ q: debouncedQuery, limit: 10, offset: 0 }),
  })

  const close = () => onOpenChange(false)

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
        navigate({ to: '/' })
        close()
      },
    },
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
      const matches = (q ? toc.items.filter((t) => t.title.toLowerCase().includes(q)) : toc.items).slice(
        0,
        30,
      )
      return matches.map((t) => ({
        kind: 'heading',
        id: `heading:${t.id}`,
        title: t.title,
        level: t.level,
        run: () => {
          document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          window.location.hash = t.id
          close()
        },
      }))
    }

    const q = parsed.text.trim()
    if (!q) {
      const recent = getRecent()
      return [...recentToItems(recent, { navigate, close }), ...baseActions]
    }

    if (!searchQuery.data) return []
    return searchQuery.data.results.map((r) => resultToItem(r, { navigate, close, query: q }))
  })()

  const safeActiveIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0
  const active = items[safeActiveIndex]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content className="fixed left-1/2 top-20 z-50 w-[min(92vw,44rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--bm-border)] bg-[var(--bm-bg)] shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="border-b border-[var(--bm-border)] p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={(e) => {
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
              }}
              placeholder="Search… (use > for actions)"
              className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Command palette input"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {parsed.mode === 'search' && parsed.text.trim() && searchQuery.isLoading ? (
              <div className="p-3 text-sm text-[color:var(--bm-muted)]">Searching…</div>
            ) : null}

            {parsed.mode === 'search' && parsed.text.trim() && searchQuery.isError ? (
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
                      {item.kind === 'action' && item.detail ? (
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function parsePaletteInput(raw: string): { mode: PaletteMode; text: string } {
  if (raw.startsWith('\\>')) return { mode: 'search', text: raw.slice(1) }
  if (raw.startsWith('\\#')) return { mode: 'search', text: raw.slice(1) }
  if (raw.startsWith('>')) return { mode: 'actions', text: raw.slice(1) }
  if (raw.startsWith('#')) return { mode: 'headings', text: raw.slice(1) }
  return { mode: 'search', text: raw }
}

function recentToItems(
  recent: RecentItem[],
  ctx: { navigate: NavigateFn; close: () => void },
): PaletteItem[] {
  return recent.slice(0, 12).map((r) => {
    if (r.kind === 'search') {
      return {
        kind: 'search',
        id: `search:${r.query}`,
        query: r.query,
        run: () => {
          recordRecentSearch(r.query)
          ctx.navigate({ to: '/search', search: { q: r.query } })
          ctx.close()
        },
      }
    }
    return {
      kind: 'page',
      id: `page:${r.name}:${r.section}`,
      name: r.name,
      section: r.section,
      description: r.description ?? '',
      run: () => {
        ctx.navigate({ to: '/man/$name/$section', params: { name: r.name, section: r.section } })
        ctx.close()
      },
    }
  })
}

function resultToItem(
  result: SearchResult,
  ctx: { navigate: NavigateFn; close: () => void; query: string },
): PaletteItem {
  return {
    kind: 'page',
    id: `page:${result.name}:${result.section}`,
    name: result.name,
    section: result.section,
    description: result.description,
    run: () => {
      recordRecentSearch(ctx.query)
      ctx.navigate({
        to: '/man/$name/$section',
        params: { name: result.name, section: result.section },
      })
      ctx.close()
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
