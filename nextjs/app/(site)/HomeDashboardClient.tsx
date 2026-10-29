'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { withDistro, type Distro } from '../../lib/distro'
import {
  BOOKMARKS_EVENT,
  BOOKMARKS_STORAGE_KEY,
  getBookmarks,
  removeBookmark,
  type BookmarkItem,
} from '../../lib/bookmarks'
import {
  getRecent,
  RECENT_EVENT,
  RECENT_STORAGE_KEY,
  type RecentItem,
} from '../../lib/recent'
import { useDistro } from '../../components/state/distro'
import { ManSectionLabel } from '../../components/man/RunningHead'
import { EmptyState } from '../../components/ui/EmptyState'
import { Kbd } from '../../components/ui/Kbd'
import { LinkPendingHint } from '../../components/ui/LinkPendingHint'
import { formatRelativeTime } from '../../lib/time'

type RecentPageItem = Extract<RecentItem, { kind: 'page' }>

function formatRelativeFromMs(ms: number): string {
  try {
    return formatRelativeTime(new Date(ms).toISOString())
  } catch {
    return ''
  }
}

function EntryRow({
  urlDistro,
  name,
  section,
  description,
  timestamp,
}: {
  urlDistro: Distro | null
  name: string
  section: string
  description?: string
  timestamp: number
}) {
  const href = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, urlDistro)

  return (
    <>
      <Link href={href} className="group min-w-0 flex-1 truncate no-underline">
        <span className="group-hover:text-accent">
          <b className="font-semibold">{name}</b>({section})
        </span>
        {description ? <span className="text-ink-2"> {description}</span> : null}
        <LinkPendingHint />
      </Link>
      <span className="shrink-0 font-sans text-xs text-ink-3">{formatRelativeFromMs(timestamp)}</span>
    </>
  )
}

export function HomeDashboardClient() {
  const { urlDistro } = useDistro()
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
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return
      if (event.key && event.key !== RECENT_STORAGE_KEY && event.key !== BOOKMARKS_STORAGE_KEY) return
      read()
    }

    window.addEventListener(RECENT_EVENT, onRecent)
    window.addEventListener(BOOKMARKS_EVENT, onBookmarks)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(RECENT_EVENT, onRecent)
      window.removeEventListener(BOOKMARKS_EVENT, onBookmarks)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return (
    <div className="mt-14 grid gap-10 sm:grid-cols-2 sm:gap-8">
      <section id="recent" aria-label="Recent" className="min-w-0">
        <ManSectionLabel as="h2">Recent</ManSectionLabel>
        {recentPages.length ? (
          <ul className={LIST}>
            {recentPages.map((it) => (
              <li key={`${it.name}:${it.section}:${it.at}`} className={ROW}>
                <EntryRow urlDistro={urlDistro} name={it.name} section={it.section} description={it.description} timestamp={it.at} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent pages" className="mt-1">
            Pages you open are listed here.
          </EmptyState>
        )}
      </section>

      <section id="bookmarks" aria-label="Bookmarks" className="min-w-0">
        <ManSectionLabel as="h2">Bookmarks</ManSectionLabel>
        {bookmarks.length ? (
          <ul className={LIST}>
            {bookmarks.map((it) => (
              <li key={`${it.name}:${it.section}:${it.addedAt}`} className={`group/row ${ROW}`}>
                <EntryRow urlDistro={urlDistro} name={it.name} section={it.section} description={it.description} timestamp={it.addedAt} />
                <button
                  type="button"
                  className="shrink-0 font-sans text-xs text-ink-3 underline decoration-rule-2 underline-offset-[3px] hover:text-accent focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0"
                  onClick={() => removeBookmark({ name: it.name, section: it.section })}
                  aria-label={`Remove bookmark for ${it.name}(${it.section})`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No bookmarks yet" className="mt-1">
            Press <Kbd>m</Kbd> on a page to keep it here.
          </EmptyState>
        )}
      </section>
    </div>
  )
}

const LIST = 'mt-1.5 font-serif text-md'
const ROW = 'flex items-baseline gap-3 py-1'
