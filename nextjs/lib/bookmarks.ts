export type BookmarkItem = {
  name: string
  section: string
  description?: string
  addedAt: number
}

export type BookmarksStore = {
  version: 1
  items: BookmarkItem[]
}

export const BOOKMARKS_STORAGE_KEY = 'bm-bookmarks'
export const BOOKMARKS_EVENT = 'bm:bookmarks-changed'
export const BOOKMARK_TOGGLE_EVENT = 'bm:bookmark-toggle'

const MAX_ITEMS = 200

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function defaultStore(): BookmarksStore {
  return { version: 1, items: [] }
}

function parseStore(raw: unknown): BookmarksStore {
  if (!raw) return defaultStore()
  if (Array.isArray(raw)) {
    const items = raw
      .map((it): BookmarkItem | null => {
        if (!it || typeof it !== 'object') return null
        const r = it as Record<string, unknown>
        if (typeof r.name !== 'string') return null
        if (typeof r.section !== 'string') return null
        if (typeof r.addedAt !== 'number') return null
        const description = typeof r.description === 'string' ? r.description : undefined
        return {
          name: r.name,
          section: r.section,
          ...(description ? { description } : {}),
          addedAt: r.addedAt,
        }
      })
      .filter((x): x is BookmarkItem => x !== null)
    return { version: 1, items }
  }

  if (typeof raw !== 'object') return defaultStore()
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return defaultStore()
  if (!Array.isArray(r.items)) return defaultStore()

  const items = r.items
    .map((it): BookmarkItem | null => {
      if (!it || typeof it !== 'object') return null
      const rr = it as Record<string, unknown>
      if (typeof rr.name !== 'string') return null
      if (typeof rr.section !== 'string') return null
      if (typeof rr.addedAt !== 'number') return null
      const description = typeof rr.description === 'string' ? rr.description : undefined
      return {
        name: rr.name,
        section: rr.section,
        ...(description ? { description } : {}),
        addedAt: rr.addedAt,
      }
    })
    .filter((x): x is BookmarkItem => x !== null)

  return { version: 1, items }
}

function emitChanged() {
  try {
    window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT))
  } catch {
    // ignore
  }
}

function writeStore(store: BookmarksStore) {
  try {
    const normalized = {
      version: 1 as const,
      items: store.items
        .slice()
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, MAX_ITEMS),
    } satisfies BookmarksStore
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // ignore
  }

  emitChanged()
}

export function getBookmarks(): BookmarksStore {
  const store = parseStore(readRaw())
  store.items.sort((a, b) => b.addedAt - a.addedAt)
  store.items = store.items.slice(0, MAX_ITEMS)
  return store
}

export function isBookmarked(opts: { name: string; section: string }): boolean {
  const store = getBookmarks()
  return store.items.some((it) => it.name === opts.name && it.section === opts.section)
}

export function addBookmark(opts: { name: string; section: string; description?: string }): boolean {
  const store = getBookmarks()
  if (store.items.some((it) => it.name === opts.name && it.section === opts.section)) return false
  store.items.unshift({
    name: opts.name,
    section: opts.section,
    description: opts.description,
    addedAt: Date.now(),
  })
  writeStore(store)
  return true
}

export function removeBookmark(opts: { name: string; section: string }): boolean {
  const store = getBookmarks()
  const next = store.items.filter((it) => !(it.name === opts.name && it.section === opts.section))
  if (next.length === store.items.length) return false
  writeStore({ version: 1, items: next })
  return true
}

export function toggleBookmark(opts: { name: string; section: string; description?: string }): boolean {
  if (isBookmarked({ name: opts.name, section: opts.section })) {
    removeBookmark({ name: opts.name, section: opts.section })
    return false
  }

  addBookmark({ name: opts.name, section: opts.section, description: opts.description })
  return true
}

export function clearBookmarks() {
  writeStore(defaultStore())
}
