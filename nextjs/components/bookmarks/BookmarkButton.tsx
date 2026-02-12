'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  BOOKMARKS_EVENT,
  BOOKMARKS_STORAGE_KEY,
  BOOKMARK_TOGGLE_EVENT,
  isBookmarked,
  toggleBookmark,
} from '../../lib/bookmarks'
import { StarIcon } from '../icons'

export function BookmarkButton({ name, section, description }: { name: string; section: string; description?: string }) {
  const key = useMemo(() => `${name}(${section})`, [name, section])
  const [active, setActive] = useState(() => isBookmarked({ name, section }))
  const [announcement, setAnnouncement] = useState('')
  const hasMountedRef = useRef(false)

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

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    setAnnouncement(active ? `Bookmarked ${key}.` : `Removed bookmark for ${key}.`)
  }, [active, key])

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Remove bookmark for ${key}` : `Bookmark ${key}`}
      className={`inline-flex size-9 items-center justify-center rounded-md border bg-[var(--bm-surface)] transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] ${
        active
          ? 'border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] text-[var(--bm-accent)]'
          : 'border-[var(--bm-border)] text-[color:var(--bm-muted)] hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)] hover:text-[color:var(--bm-fg)]'
      }`}
      onClick={onToggle}
      title={active ? `Bookmarked: ${key}` : `Bookmark: ${key}`}
    >
      <StarIcon filled={active} className="size-4" />
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </button>
  )
}
