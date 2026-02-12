'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import type { Distro } from '../lib/distro'
import { withDistro } from '../lib/distro'
import {
  BOOKMARKS_EVENT,
  getBookmarks,
  removeBookmark,
  type BookmarkItem,
} from '../lib/bookmarks'
import {
  getRecent,
  RECENT_EVENT,
  type RecentItem,
} from '../lib/recent'

type RecentPageItem = Extract<RecentItem, { kind: 'page' }>
import { formatRelativeTime } from '../lib/time'

function formatRelativeFromMs(ms: number): string {
  try {
    return formatRelativeTime(new Date(ms).toISOString())
  } catch {
    return ''
  }
}

function ManLink({ distro, name, section, children }: { distro: Distro; name: string; section: string; children: React.ReactNode }) {
  const href = useMemo(() => {
    const encodedName = encodeURIComponent(name)
    const encodedSection = encodeURIComponent(section)
    return withDistro(`/man/${encodedName}/${encodedSection}`, distro)
  }, [distro, name, section])

  return (
    <Link
      href={href}
      className="min-w-0 flex-1 rounded-[var(--bm-radius)] px-3 py-2 transition-colors hover:bg-[var(--bm-surface-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
    >
      {children}
    </Link>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm">
      <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">{title}</div>
      <div className="mt-1 text-[color:var(--bm-muted)]">{body}</div>
    </div>
  )
}

export function HomeDashboardClient({ distro }: { distro: Distro }) {
  const [recentPages, setRecentPages] = useState<RecentPageItem[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])

  useEffect(() => {
    const read = () => {
      const pages = getRecent()
        .filter((it): it is RecentPageItem => it.kind === 'page')
        .slice(0, 8)
      setRecentPages(pages)

      setBookmarks(getBookmarks().items)
    }

    read()

    const onRecent = () => read()
    const onBookmarks = () => read()

    window.addEventListener(RECENT_EVENT, onRecent)
    window.addEventListener(BOOKMARKS_EVENT, onBookmarks)
    return () => {
      window.removeEventListener(RECENT_EVENT, onRecent)
      window.removeEventListener(BOOKMARKS_EVENT, onBookmarks)
    }
  }, [])

  return (
    <div className="mt-10 grid gap-10">
      <section aria-label="Recent">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Recent</h2>
        </div>

        {recentPages.length ? (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)]">
            {recentPages.map((it) => (
              <div key={`${it.name}:${it.section}:${it.at}`} className="group flex items-stretch border-b border-[var(--bm-border)] last:border-b-0">
                <ManLink distro={distro} name={it.name} section={it.section}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-[color:var(--bm-fg)]">
                        {it.name}({it.section})
                      </div>
                      {it.description ? (
                        <div className="mt-0.5 truncate text-sm text-[color:var(--bm-muted)]">{it.description}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 pt-0.5 font-mono text-xs text-[color:var(--bm-muted)]">
                      {formatRelativeFromMs(it.at)}
                    </div>
                  </div>
                </ManLink>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState title="No recent pages" body="Open a man page and it will show up here." />
          </div>
        )}
      </section>

      <section aria-label="Bookmarks">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Bookmarks</h2>
        </div>

        {bookmarks.length ? (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)]">
            {bookmarks.map((it) => (
              <div key={`${it.name}:${it.section}:${it.addedAt}`} className="group flex items-stretch border-b border-[var(--bm-border)] last:border-b-0">
                <ManLink distro={distro} name={it.name} section={it.section}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-[color:var(--bm-fg)]">
                        {it.name}({it.section})
                      </div>
                      {it.description ? (
                        <div className="mt-0.5 truncate text-sm text-[color:var(--bm-muted)]">{it.description}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 pt-0.5 font-mono text-xs text-[color:var(--bm-muted)]">
                      {formatRelativeFromMs(it.addedAt)}
                    </div>
                  </div>
                </ManLink>

                <button
                  type="button"
                  className="hidden shrink-0 items-center justify-center px-3 text-xs text-[color:var(--bm-muted)] opacity-0 transition-opacity hover:text-[color:var(--bm-fg)] group-hover:opacity-100 sm:flex"
                  onClick={() => removeBookmark({ name: it.name, section: it.section })}
                  aria-label={`Remove bookmark for ${it.name}(${it.section})`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState title="No bookmarks yet" body="Star a man page to pin it here." />
          </div>
        )}
      </section>
    </div>
  )
}