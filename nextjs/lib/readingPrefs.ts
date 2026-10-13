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
export const READING_PREFS_EVENT = 'bm:reading-prefs-changed'

// Defaults mirror the SSR fallback in globals.css and DESIGN.md.
const DEFAULT_PREFS: ReadingPreferences = {
  version: 1,
  fontSize: 'medium',
  fontFamily: 'sans',
  lineHeight: 'normal',
  columnWidth: 'normal',
  codeTheme: 'auto',
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(READING_PREFS_STORAGE_KEY)
  } catch {
    return null
  }
}

export function prefsFromCookieString(raw: string | null | undefined): ReadingPreferences {
  try {
    return raw ? parsePrefs(JSON.parse(decodeURIComponent(raw))) : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

function prefsFromBrowserCookie(): ReadingPreferences {
  try {
    const prefix = `${READING_PREFS_COOKIE}=`
    const cookie = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(prefix))
    return prefsFromCookieString(cookie?.slice(prefix.length))
  } catch {
    return DEFAULT_PREFS
  }
}

export function syncReadingPrefsCookie(prefs: ReadingPreferences) {
  try {
    document.cookie = `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
  } catch {
    // Cookie persistence is best-effort, independently of localStorage.
  }
}

function parsePrefs(raw: unknown): ReadingPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return DEFAULT_PREFS

  const fontSize = r.fontSize
  const fontFamily = r.fontFamily
  const lineHeight = r.lineHeight
  const columnWidth = r.columnWidth
  const codeTheme = r.codeTheme

  if (fontSize !== 'small' && fontSize !== 'medium' && fontSize !== 'large' && fontSize !== 'xlarge') return DEFAULT_PREFS
  if (fontFamily !== 'serif' && fontFamily !== 'sans' && fontFamily !== 'mono') return DEFAULT_PREFS
  if (lineHeight !== 'compact' && lineHeight !== 'normal' && lineHeight !== 'relaxed') return DEFAULT_PREFS
  if (columnWidth !== 'narrow' && columnWidth !== 'normal' && columnWidth !== 'wide') return DEFAULT_PREFS
  if (codeTheme !== 'light' && codeTheme !== 'dark' && codeTheme !== 'auto') return DEFAULT_PREFS

  return {
    version: 1,
    fontSize,
    fontFamily,
    lineHeight,
    columnWidth,
    codeTheme,
  }
}

function emitChanged(prefs: ReadingPreferences) {
  try {
    window.dispatchEvent(new CustomEvent(READING_PREFS_EVENT, { detail: prefs }))
  } catch {
    // ignore
  }
}

function writePrefs(prefs: ReadingPreferences) {
  try {
    localStorage.setItem(READING_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
  syncReadingPrefsCookie(prefs)
  emitChanged(prefs)
}

export function getReadingPrefs(): ReadingPreferences {
  // localStorage wins after hydration; the cookie seeds SSR and is a fallback
  // when localStorage is absent or unavailable.
  const raw = readRaw()
  if (raw === null) return prefsFromBrowserCookie()
  try {
    return parsePrefs(JSON.parse(raw))
  } catch {
    return DEFAULT_PREFS
  }
}

export function setReadingPrefs(prefs: ReadingPreferences) {
  writePrefs(prefs)
}

export function resetReadingPrefs() {
  writePrefs(DEFAULT_PREFS)
}

export { DEFAULT_PREFS }
