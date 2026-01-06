type RecentItem =
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

const STORAGE_KEY = 'bm-recent'
const MAX_ITEMS = 30

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  } catch {
    // ignore
  }
}

export function getRecent(): RecentItem[] {
  const raw = readRaw()
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

  parsed.sort((a, b) => b.at - a.at)
  return parsed.slice(0, MAX_ITEMS)
}

export function clearRecent() {
  write([])
}

export function recordRecentPage(opts: { name: string; section: string; description?: string }) {
  const item: RecentItem = {
    kind: 'page',
    name: opts.name,
    section: opts.section,
    description: opts.description,
    at: Date.now(),
  }

  const existing = getRecent()
  const without = existing.filter(
    (x) => !(x.kind === 'page' && x.name === item.name && x.section === item.section),
  )

  write([item, ...without])
}

export function recordRecentSearch(query: string) {
  const q = query.trim()
  if (!q) return

  const item: RecentItem = { kind: 'search', query: q, at: Date.now() }
  const existing = getRecent()
  const without = existing.filter((x) => !(x.kind === 'search' && x.query === item.query))
  write([item, ...without])
}

export type { RecentItem }

