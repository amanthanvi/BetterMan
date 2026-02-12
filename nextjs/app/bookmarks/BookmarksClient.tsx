'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { BookmarkItem } from '../../lib/bookmarks'
import {
  BOOKMARKS_EVENT,
  BOOKMARKS_STORAGE_KEY,
  clearBookmarks,
  getBookmarks,
  removeBookmark,
} from '../../lib/bookmarks'
import { withDistro } from '../../lib/distro'
import { formatRelativeTime } from '../../lib/time'
import { useDistro } from '../../components/state/distro'

function msToIso(ms: number): string {
  const dt = new Date(ms)
  if (!Number.isFinite(dt.getTime())) return ''
  return dt.toISOString()
}

export function BookmarksClient() {
  const router = useRouter()
  const distro = useDistro()

  const [filter, setFilter] = useState('')
  const [items, setItems] = useState<BookmarkItem[]>(() => getBookmarks().items)

  useEffect(() => {
    const sync = () => setItems(getBookmarks().items)
    const onBookmarks = () => sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BOOKMARKS_STORAGE_KEY) return
      sync()
    }

    window.addEventListener(BOOKMARKS_EVENT, onBookmarks)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(BOOKMARKS_EVENT, onBookmarks)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const label = `${it.name}(${it.section})`.toLowerCase()
      const desc = (it.description ?? '').toLowerCase()
      return label.includes(q) || desc.includes(q)
    })
  }, [filter, items])

  const clear = () => {
    if (!items.length) return
    if (!window.confirm('Clear all bookmarks?')) return
    clearBookmarks()
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Bookmarks</h1>
            <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
              Saved man pages (stored locally in your browser).
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9] disabled:opacity-50"
            onClick={clear}
            disabled={!items.length}
          >
            Clear all
          </button>
        </div>

        <div className="mt-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter bookmarks…"
            className="w-full rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter bookmarks"
          />
        </div>
      </header>

      <section className="mt-6">
        {!filtered.length ? (
          <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
            No bookmarks yet.
          </div>
        ) : (
          <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)]">
            <ul className="divide-y divide-[var(--bm-border)]">
              {filtered.map((it) => (
                <li key={`${it.name}:${it.section}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <button
                    type="button"
                    className="min-w-0 text-left hover:underline"
                    onClick={() =>
                      router.push(withDistro(`/man/${encodeURIComponent(it.name)}/${encodeURIComponent(it.section)}`, distro.distro))
                    }
                  >
                    <div className="font-mono text-sm text-[color:var(--bm-fg)]">
                      {it.name}({it.section})
                    </div>
                    {it.description ? (
                      <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{it.description}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[color:var(--bm-muted)]">
                      Saved {formatRelativeTime(msToIso(it.addedAt))}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-xs font-medium text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-bg)/0.55]"
                    onClick={() => removeBookmark({ name: it.name, section: it.section })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
