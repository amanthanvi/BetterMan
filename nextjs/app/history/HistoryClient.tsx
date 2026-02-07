'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { RecentItem } from '../../lib/recent'
import {
  RECENT_EVENT,
  RECENT_STORAGE_KEY,
  clearRecent,
  getRecent,
  removeRecent,
} from '../../lib/recent'
import { formatRelativeTime } from '../../lib/time'
import { useDistro } from '../../components/state/distro'

type Tab = 'all' | 'pages' | 'searches'

function withDistro(path: string, distro: string): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
}

function msToIso(ms: number): string {
  const dt = new Date(ms)
  if (!Number.isFinite(dt.getTime())) return ''
  return dt.toISOString()
}

function groupLabel(item: RecentItem): 'Today' | 'Yesterday' | 'Last 7 days' | 'Older' {
  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)

  const startLast7 = new Date(startToday)
  startLast7.setDate(startLast7.getDate() - 7)

  const t = item.at
  if (t >= startToday.getTime()) return 'Today'
  if (t >= startYesterday.getTime()) return 'Yesterday'
  if (t >= startLast7.getTime()) return 'Last 7 days'
  return 'Older'
}

export function HistoryClient() {
  const router = useRouter()
  const distro = useDistro()

  const [tab, setTab] = useState<Tab>('all')
  const [filter, setFilter] = useState('')
  const [items, setItems] = useState<RecentItem[]>(() => getRecent())

  useEffect(() => {
    const sync = () => setItems(getRecent())
    const onRecent = () => sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== RECENT_STORAGE_KEY) return
      sync()
    }

    window.addEventListener(RECENT_EVENT, onRecent)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(RECENT_EVENT, onRecent)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const base = items.filter((it) => {
      if (tab === 'pages' && it.kind !== 'page') return false
      if (tab === 'searches' && it.kind !== 'search') return false
      if (!q) return true

      if (it.kind === 'search') return it.query.toLowerCase().includes(q)
      const label = `${it.name}(${it.section})`.toLowerCase()
      const desc = (it.description ?? '').toLowerCase()
      return label.includes(q) || desc.includes(q)
    })

    base.sort((a, b) => b.at - a.at)
    return base
  }, [filter, items, tab])

  const groups = useMemo(() => {
    const map = new Map<string, RecentItem[]>()
    for (const it of filtered) {
      const label = groupLabel(it)
      const list = map.get(label) ?? []
      list.push(it)
      map.set(label, list)
    }
    for (const list of map.values()) list.sort((a, b) => b.at - a.at)

    const order: Array<'Today' | 'Yesterday' | 'Last 7 days' | 'Older'> = ['Today', 'Yesterday', 'Last 7 days', 'Older']
    return order
      .map((k) => ({ title: k, items: map.get(k) ?? [] }))
      .filter((g) => g.items.length)
  }, [filtered])

  const clear = () => {
    if (!items.length) return
    if (!window.confirm('Clear all history?')) return
    clearRecent()
  }

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <button
      type="button"
      className={`rounded-full border border-[var(--bm-border)] px-4 py-2 text-sm font-medium ${
        tab === id
          ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
          : 'bg-[color:var(--bm-surface)/0.75] text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.9] hover:text-[color:var(--bm-fg)]'
      }`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">History</h1>
            <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
              Recently viewed pages and searches (stored locally in your browser).
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] disabled:opacity-50"
            onClick={clear}
            disabled={!items.length}
          >
            Clear all
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <TabButton id="all" label="All" />
          <TabButton id="pages" label="Pages" />
          <TabButton id="searches" label="Searches" />
        </div>

        <div className="mt-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter history…"
            className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter history"
          />
        </div>
      </header>

      <section className="mt-6 space-y-6">
        {!filtered.length ? (
          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
            No history yet.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.title}>
              <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">{g.title}</div>
              <div className="mt-3 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] shadow-sm">
                <ul className="divide-y divide-[var(--bm-border)]">
                  {g.items.map((it) => (
                    <li key={it.kind === 'search' ? `search:${it.query}` : `page:${it.name}:${it.section}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <button
                        type="button"
                        className="min-w-0 text-left hover:underline"
                        onClick={() => {
                          if (it.kind === 'search') {
                            router.push(withDistro(`/search?q=${encodeURIComponent(it.query)}`, distro.distro))
                          } else {
                            router.push(withDistro(`/man/${encodeURIComponent(it.name)}/${encodeURIComponent(it.section)}`, distro.distro))
                          }
                        }}
                      >
                        {it.kind === 'search' ? (
                          <>
                            <div className="text-sm text-[color:var(--bm-fg)]">
                              Search: <span className="font-mono">{it.query}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono text-sm text-[color:var(--bm-fg)]">
                              {it.name}({it.section})
                            </div>
                            {it.description ? (
                              <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{it.description}</div>
                            ) : null}
                          </>
                        )}
                        <div className="mt-1 text-xs text-[color:var(--bm-muted)]">
                          {formatRelativeTime(msToIso(it.at))}
                        </div>
                      </button>

                      <button
                        type="button"
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-xs font-medium text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-bg)/0.55]"
                        onClick={() => {
                          if (it.kind === 'search') removeRecent({ kind: 'search', query: it.query })
                          else removeRecent({ kind: 'page', name: it.name, section: it.section })
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
