'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, BOOKMARK_TOGGLE_EVENT, isBookmarked, toggleBookmark } from '../../lib/bookmarks'

export function BookmarkButton({ name, section, description }: { name: string; section: string; description?: string }) {
  const key = useMemo(() => `${name}(${section})`, [name, section])
  const [active, setActive] = useState(() => isBookmarked({ name, section }))

  const sync = useCallback(() => {
    setActive(isBookmarked({ name, section }))
  }, [name, section])

  useEffect(() => {
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
  }, [sync])

  const onToggle = useCallback(() => {
    const next = toggleBookmark({ name, section, description })
    setActive(next)
  }, [description, name, section])

  useEffect(() => {
    const onRequest = () => onToggle()
    window.addEventListener(BOOKMARK_TOGGLE_EVENT, onRequest)
    return () => window.removeEventListener(BOOKMARK_TOGGLE_EVENT, onRequest)
  }, [onToggle])

  return (
    <button
      type="button"
      aria-pressed={active}
      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
      onClick={onToggle}
      title={active ? `Bookmarked: ${key}` : `Bookmark: ${key}`}
    >
      {active ? 'Bookmarked' : 'Bookmark'}
    </button>
  )
}
