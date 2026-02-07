export type RecentItem =
  | {
      kind: 'page'
      name: string
      section: string
      description?: string
      at: number
    }
  | {
      kind: 'search'
      query: string
      at: number
    }

export type RecentStore = {
  version: 1
  items: RecentItem[]
  lastCleared?: number
}

export const RECENT_STORAGE_KEY = 'bm-recent'
export const RECENT_EVENT = 'bm:recent-changed'

const MAX_ITEMS = 120

function defaultStore(): RecentStore {
  return { version: 1, items: [] }
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function parseItems(raw: unknown): RecentItem[] {
  if (!Array.isArray(raw)) return []

  const parsed: RecentItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (r.kind === 'page') {
      if (typeof r.name !== 'string') continue
      if (typeof r.section !== 'string') continue
      if (typeof r.at !== 'number') continue
      parsed.push({
        kind: 'page',
        name: r.name,
        section: r.section,
        description: typeof r.description === 'string' ? r.description : undefined,
        at: r.at,
      })
    } else if (r.kind === 'search') {
      if (typeof r.query !== 'string') continue
      if (typeof r.at !== 'number') continue
      parsed.push({ kind: 'search', query: r.query, at: r.at })
    }
  }
  return parsed
}

function parseStore(raw: unknown): RecentStore {
  if (!raw) return defaultStore()

  if (Array.isArray(raw)) {
    return { version: 1, items: parseItems(raw) }
  }

  if (typeof raw !== 'object') return defaultStore()
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return defaultStore()
  const items = parseItems(r.items)
  const lastCleared = typeof r.lastCleared === 'number' ? r.lastCleared : undefined
  return { version: 1, items, lastCleared }
}

function emitChanged() {
  try {
    window.dispatchEvent(new CustomEvent(RECENT_EVENT))
  } catch {
    // ignore
  }
}

function writeStore(store: RecentStore) {
  try {
    const normalized = normalizeStore(store)
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // ignore
  }
  emitChanged()
}

function normalizeStore(store: RecentStore): RecentStore {
  const items = store.items
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ITEMS)
  return { version: 1, items, lastCleared: store.lastCleared }
}

export function getRecentStore(): RecentStore {
  return normalizeStore(parseStore(readRaw()))
}

export function getRecent(): RecentItem[] {
  return getRecentStore().items
}

export function clearRecent() {
  writeStore({ version: 1, items: [], lastCleared: Date.now() })
}

export type RecentKey =
  | { kind: 'page'; name: string; section: string }
  | { kind: 'search'; query: string }

export function removeRecent(key: RecentKey) {
  const store = getRecentStore()
  const next = store.items.filter((x) => !matches(x, key))
  if (next.length === store.items.length) return
  writeStore({ ...store, items: next })
}

function matches(a: RecentItem, b: RecentKey) {
  if (b.kind === 'page') return a.kind === 'page' && a.name === b.name && a.section === b.section
  return a.kind === 'search' && a.query === b.query
}

export function recordRecentPage(opts: { name: string; section: string; description?: string }) {
  const item: RecentItem = {
    kind: 'page',
    name: opts.name,
    section: opts.section,
    description: opts.description,
    at: Date.now(),
  }

  const store = getRecentStore()
  const without = store.items.filter((x) => !(x.kind === 'page' && x.name === item.name && x.section === item.section))
  writeStore({ ...store, items: [item, ...without] })
}

export function recordRecentSearch(query: string) {
  const q = query.trim()
  if (!q) return

  const item: RecentItem = { kind: 'search', query: q, at: Date.now() }
  const store = getRecentStore()
  const without = store.items.filter((x) => !(x.kind === 'search' && x.query === item.query))
  writeStore({ ...store, items: [item, ...without] })
}
