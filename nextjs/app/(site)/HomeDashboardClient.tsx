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
import { useLang } from '../../components/state/lang'
import { tRich } from '../../lib/i18n/rich'
import type { Lang } from '../../lib/i18n/locales'
import type { ClientT } from '../../lib/i18n/server'
import { ManSectionLabel } from '../../components/man/RunningHead'
import { EmptyState } from '../../components/ui/EmptyState'
import { Kbd } from '../../components/ui/Kbd'
import { LinkPendingHint } from '../../components/ui/LinkPendingHint'
import { formatRelativeTime } from '../../lib/time'

type RecentPageItem = Extract<RecentItem, { kind: 'page' }>

function formatRelativeFromMs(ms: number, lang: Lang, t: ClientT): string {
  try {
    return formatRelativeTime(new Date(ms).toISOString(), lang, t('just now'))
  } catch {
    return ''
  }
}

function EntryRow({
  urlDistro,
  urlLang,
  lang,
  t,
  name,
  section,
  description,
  timestamp,
}: {
  urlDistro: Distro | null
  urlLang: Lang | null
  lang: Lang
  t: ClientT
  name: string
  section: string
  description?: string
  timestamp: number
}) {
  const href = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, urlDistro, urlLang)

  return (
    <>
      <Link href={href} className="group min-w-0 flex-1 truncate no-underline">
        <span className="group-hover:text-accent">
          <b className="font-semibold">{name}</b>({section})
        </span>
        {description ? <span className="text-ink-2"> {description}</span> : null}
        <LinkPendingHint />
      </Link>
      <span className="shrink-0 font-sans text-xs text-ink-3">{formatRelativeFromMs(timestamp, lang, t)}</span>
    </>
  )
}

export function HomeDashboardClient() {
  const { urlDistro } = useDistro()
  const { t, lang, urlLang } = useLang()
  const [recentPages, setRecentPages] = useState<RecentPageItem[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  // /#recent and /#bookmarks (the h key, /history, /bookmarks, app shortcuts) ask for a
  // section by name; an asked-for empty section says how to fill it rather than vanish.
  const [asked, setAsked] = useState<'recent' | 'bookmarks' | null>(null)

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1)
      setAsked(hash === 'recent' || hash === 'bookmarks' ? hash : null)
    }
    read()
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    return () => {
      window.removeEventListener('hashchange', read)
      window.removeEventListener('popstate', read)
    }
  }, [])

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

  // Recents and bookmarks appear once they exist; an empty home has no empty sections.
  if (!recentPages.length && !bookmarks.length && !asked) return null

  return (
    <div className="mt-14 grid gap-10 sm:grid-cols-2 sm:gap-8">
      {recentPages.length || asked === 'recent' ? (
        <section id="recent" aria-label={t('Recent')} className="min-w-0">
          <ManSectionLabel as="h2">{t('Recent')}</ManSectionLabel>
          {recentPages.length ? null : (
            <EmptyState title={t('No recent pages')} className="mt-1">
              {t('Pages you open are listed here.')}
            </EmptyState>
          )}
          <ul className={LIST}>
            {recentPages.map((it) => (
              <li key={`${it.name}:${it.section}:${it.at}`} className={ROW}>
                <EntryRow urlDistro={urlDistro} urlLang={urlLang} lang={lang} t={t} name={it.name} section={it.section} description={it.description} timestamp={it.at} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookmarks.length || asked === 'bookmarks' ? (
        <section id="bookmarks" aria-label={t('Bookmarks')} className="min-w-0">
          <ManSectionLabel as="h2">{t('Bookmarks')}</ManSectionLabel>
          {bookmarks.length ? null : (
            <EmptyState title={t('No bookmarks yet')} className="mt-1">
              {tRich(t, 'Press {key} on a page to keep it here.', { key: <Kbd>m</Kbd> })}
            </EmptyState>
          )}
          <ul className={LIST}>
            {bookmarks.map((it) => (
              <li key={`${it.name}:${it.section}:${it.addedAt}`} className={`group/row ${ROW}`}>
                <EntryRow urlDistro={urlDistro} urlLang={urlLang} lang={lang} t={t} name={it.name} section={it.section} description={it.description} timestamp={it.addedAt} />
                <button
                  type="button"
                  className="shrink-0 font-sans text-xs text-ink-3 underline decoration-rule-2 underline-offset-[3px] hover:text-accent focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0"
                  onClick={() => removeBookmark({ name: it.name, section: it.section })}
                  aria-label={t('Remove bookmark for {citation}', { citation: `${it.name}(${it.section})` })}
                >
                  {t('Remove')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

const LIST = 'mt-1.5 font-serif text-md'
const ROW = 'flex items-baseline gap-3 py-1'
