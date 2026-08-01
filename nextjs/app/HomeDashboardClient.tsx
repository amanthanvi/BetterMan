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
import { EmptyState } from '../components/ui/EmptyState'
import { Kbd } from '../components/ui/Kbd'
import { formatRelativeTime } from '../lib/time'

type RecentPageItem = Extract<RecentItem, { kind: 'page' }>

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
    <Link href={href} className="group min-w-0 flex-1 py-2.5 transition-colors hover:no-underline">
      {children}
    </Link>
  )
}

function EntryRow({
  distro,
  name,
  section,
  description,
  timestamp,
}: {
  distro: Distro
  name: string
  section: string
  description?: string
  timestamp: number
}) {
  return (
    <ManLink distro={distro} name={name} section={section}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 font-mono text-sm font-semibold text-fg group-hover:text-accent">
            {name}({section})
          </span>
          {description ? <span className="min-w-0 truncate text-sm text-muted">{description}</span> : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-faint">{formatRelativeFromMs(timestamp)}</span>
      </div>
    </ManLink>
  )
}

export function HomeDashboardClient({
  distro,
}: {
  distro: Distro
}) {
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
      <section id="recent" aria-label="Recent">
        <h2 className="font-mono text-xs font-semibold tracking-[0.08em] text-muted">RECENT</h2>

        <div className="pl-6 sm:pl-8">
          {recentPages.length ? (
            <div className="mt-2">
              {recentPages.map((it) => (
                <div key={`${it.name}:${it.section}:${it.at}`} className="flex items-stretch border-b border-edge last:border-b-0">
                  <EntryRow distro={distro} name={it.name} section={it.section} description={it.description} timestamp={it.at} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent pages" className="mt-2">
              Pages you read show up here. Try searching for <span className="font-mono text-fg">tar</span>.
            </EmptyState>
          )}
        </div>
      </section>

      <section id="bookmarks" aria-label="Bookmarks">
        <h2 className="font-mono text-xs font-semibold tracking-[0.08em] text-muted">BOOKMARKS</h2>

        <div className="pl-6 sm:pl-8">
          {bookmarks.length ? (
            <div className="mt-2">
              {bookmarks.map((it) => (
                <div key={`${it.name}:${it.section}:${it.addedAt}`} className="group/row flex items-stretch border-b border-edge last:border-b-0">
                  <EntryRow distro={distro} name={it.name} section={it.section} description={it.description} timestamp={it.addedAt} />
                  <button
                    type="button"
                    className="hidden shrink-0 items-center justify-center px-3 text-xs text-muted opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 sm:flex"
                    onClick={() => removeBookmark({ name: it.name, section: it.section })}
                    aria-label={`Remove bookmark for ${it.name}(${it.section})`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No bookmarks yet" className="mt-2">
              Press <Kbd>M</Kbd> on any man page to pin it here.
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  )
}
