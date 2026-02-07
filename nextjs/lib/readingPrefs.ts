export type ReadingPreferences = {
  version: 1
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'
  fontFamily: 'serif' | 'sans' | 'mono'
  lineHeight: 'compact' | 'normal' | 'relaxed'
  columnWidth: 'narrow' | 'normal' | 'wide'
  codeTheme: 'light' | 'dark' | 'auto'
}

export const READING_PREFS_STORAGE_KEY = 'bm-reading-prefs'
export const READING_PREFS_EVENT = 'bm:reading-prefs-changed'

const DEFAULT_PREFS: ReadingPreferences = {
  version: 1,
  fontSize: 'medium',
  fontFamily: 'serif',
  lineHeight: 'relaxed',
  columnWidth: 'normal',
  codeTheme: 'auto',
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(READING_PREFS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
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

function emitChanged() {
  try {
    window.dispatchEvent(new CustomEvent(READING_PREFS_EVENT))
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
  emitChanged()
}

export function getReadingPrefs(): ReadingPreferences {
  return parsePrefs(readRaw())
}

export function setReadingPrefs(prefs: ReadingPreferences) {
  writePrefs(prefs)
}

export function updateReadingPrefs(partial: Partial<Omit<ReadingPreferences, 'version'>>) {
  const current = getReadingPrefs()
  const next: ReadingPreferences = { ...current, ...partial, version: 1 }
  writePrefs(next)
}

export function resetReadingPrefs() {
  writePrefs(DEFAULT_PREFS)
}

export { DEFAULT_PREFS }
