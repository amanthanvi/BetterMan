'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, BOOKMARK_TOGGLE_EVENT, isBookmarked, toggleBookmark } from '../../lib/bookmarks'

type IconProps = { className?: string }

function IconStar({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </svg>
  )
}

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
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
        active
          ? 'border-[color:var(--bm-accent)/0.4] bg-[color:var(--bm-accent)/0.12] hover:bg-[color:var(--bm-accent)/0.16]'
          : 'border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] hover:bg-[color:var(--bm-bg)/0.55]'
      }`}
      onClick={onToggle}
      title={active ? `Bookmarked: ${key}` : `Bookmark: ${key}`}
    >
      <IconStar
        filled={active}
        className={`size-4 ${active ? 'text-[var(--bm-accent)]' : 'text-[color:var(--bm-muted)]'}`}
      />
      {active ? 'Bookmarked' : 'Bookmark'}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </button>
  )
}
