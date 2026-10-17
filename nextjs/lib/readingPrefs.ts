export type ReadingPreferences = {
  version: 1
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'
  fontFamily: 'serif' | 'sans' | 'mono'
  lineHeight: 'compact' | 'normal' | 'relaxed'
  columnWidth: 'narrow' | 'normal' | 'wide'
  codeTheme: 'light' | 'dark' | 'auto'
}

export const READING_PREFS_STORAGE_KEY = 'bm-reading-prefs'
export const READING_PREFS_COOKIE = 'bm-reading-prefs'

// Matches the unset fallback in globals.css, so a visitor without saved
// preferences renders the same before and after hydration.
const DEFAULT_PREFS: ReadingPreferences = {
  version: 1,
  fontSize: 'medium',
  fontFamily: 'sans',
  lineHeight: 'normal',
  columnWidth: 'normal',
  codeTheme: 'auto',
}

function parsePrefs(json: string | null | undefined): ReadingPreferences | null {
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return null

  const fontSize = r.fontSize
  const fontFamily = r.fontFamily
  const lineHeight = r.lineHeight
  const columnWidth = r.columnWidth
  const codeTheme = r.codeTheme

  if (fontSize !== 'small' && fontSize !== 'medium' && fontSize !== 'large' && fontSize !== 'xlarge') return null
  if (fontFamily !== 'serif' && fontFamily !== 'sans' && fontFamily !== 'mono') return null
  if (lineHeight !== 'compact' && lineHeight !== 'normal' && lineHeight !== 'relaxed') return null
  if (columnWidth !== 'narrow' && columnWidth !== 'normal' && columnWidth !== 'wide') return null
  if (codeTheme !== 'light' && codeTheme !== 'dark' && codeTheme !== 'auto') return null

  return {
    version: 1,
    fontSize,
    fontFamily,
    lineHeight,
    columnWidth,
    codeTheme,
  }
}

function writeCookie(value: string, maxAge: number) {
  try {
    document.cookie = `${READING_PREFS_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  } catch {
    // ignore
  }
}

// The server renders from this cookie. It is written only for saved
// preferences, so visitors without any keep following DEFAULT_PREFS.
function syncReadingPrefsCookie(prefs: ReadingPreferences) {
  writeCookie(JSON.stringify(prefs), 31536000)
}

// `raw` is the cookie value as Next.js returns it, already URI-decoded.
export function prefsFromCookie(raw: string | undefined): ReadingPreferences {
  return parsePrefs(raw) ?? DEFAULT_PREFS
}

// Saved preferences from localStorage, or null when there are none.
export function getStoredReadingPrefs(): ReadingPreferences | null {
  try {
    return parsePrefs(localStorage.getItem(READING_PREFS_STORAGE_KEY))
  } catch {
    return null
  }
}

// localStorage wins after hydration. Refreshing the cookie from it corrects a
// missing or stale cookie, including one saved before the cookie existed.
export function restoreReadingPrefs(): ReadingPreferences | null {
  const stored = getStoredReadingPrefs()
  if (stored) syncReadingPrefsCookie(stored)
  return stored
}

export function setReadingPrefs(prefs: ReadingPreferences) {
  try {
    localStorage.setItem(READING_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
  syncReadingPrefsCookie(prefs)
}

// Clears saved preferences rather than saving the defaults, so future
// default changes reach this visitor too.
export function resetReadingPrefs() {
  try {
    localStorage.removeItem(READING_PREFS_STORAGE_KEY)
  } catch {
    // ignore
  }
  writeCookie('', 0)
}

export { DEFAULT_PREFS }
