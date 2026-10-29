import { DISTRO_COOKIE, DISTRO_STORAGE_KEY, normalizeDistro, type Distro } from '../lib/distro'
import {
  DEFAULT_PREFS,
  getStoredReadingPrefs,
  resetReadingPrefs,
  setReadingPrefs,
  type ReadingPreferences,
} from '../lib/readingPrefs'
import { announce } from './dom'

/**
 * The reader's theme, reading preferences and default distro, with the same
 * storage and cookies as the App Router providers (components/state), so both
 * kinds of page agree. The boot script (lib/manBoot.ts) applied them before
 * first paint; these keep them in sync after that.
 */

export type ThemeMode = 'system' | 'light' | 'dark'

function writeCookie(name: string, value: string, maxAge = 31536000) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  } catch {
    // ignore
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// ---- Theme ----

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function themeMode(): ThemeMode {
  const raw = readStorage('bm-theme')
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

function resolved(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return darkQuery().matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const theme = resolved(mode)
  document.documentElement.dataset.theme = theme
  // App Router pages render data-theme from this cookie.
  writeCookie('bm-theme-resolved', theme)
  const button = document.querySelector<HTMLElement>('[data-bm-action="theme"]')
  if (button) button.title = `Theme: ${mode} (d)`
}

export function cycleTheme() {
  const mode = themeMode()
  const next: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
  try {
    localStorage.setItem('bm-theme', next)
  } catch {
    // ignore
  }
  writeCookie('bm-theme', next)
  applyTheme(next)
  announce('theme', `Theme: ${next}.`)
}

export function initTheme() {
  applyTheme(themeMode())
  darkQuery().addEventListener('change', () => {
    if (themeMode() === 'system') applyTheme('system')
  })
}

// ---- Reading preferences ----

const PREF_ATTRIBUTES = {
  fontSize: 'data-bm-font-size',
  fontFamily: 'data-bm-font-family',
  lineHeight: 'data-bm-line-height',
  columnWidth: 'data-bm-column-width',
  codeTheme: 'data-bm-code-theme',
} as const

export type PrefAxis = keyof typeof PREF_ATTRIBUTES

export function readingPrefs(): ReadingPreferences {
  return getStoredReadingPrefs() ?? DEFAULT_PREFS
}

/** On <html>, where the boot script put them; globals.css reads them from either <html> or <body>. */
function applyPrefs(prefs: ReadingPreferences) {
  for (const [axis, attribute] of Object.entries(PREF_ATTRIBUTES)) {
    document.documentElement.setAttribute(attribute, prefs[axis as PrefAxis])
  }
}

export function updatePrefs(patch: Partial<Omit<ReadingPreferences, 'version'>>) {
  const next: ReadingPreferences = { ...readingPrefs(), ...patch, version: 1 }
  setReadingPrefs(next)
  applyPrefs(next)
}

export function resetPrefs() {
  resetReadingPrefs()
  syncPrefs()
}

/** The stored preferences on <html>, or none: unset attributes are the defaults in globals.css. */
export function syncPrefs() {
  const stored = getStoredReadingPrefs()
  if (stored) applyPrefs(stored)
  else for (const attribute of Object.values(PREF_ATTRIBUTES)) document.documentElement.removeAttribute(attribute)
}

export function initPrefs() {
  // Another tab changed them.
  window.addEventListener('storage', (e) => {
    if (e.key === 'bm-reading-prefs') syncPrefs()
  })
}

// ---- Distro ----

/** The URL's own `?distro=`; null for a bare URL, whose links stay bare. */
export function urlDistro(): Distro | null {
  return normalizeDistro(new URLSearchParams(window.location.search).get('distro'))
}

export function preferredDistro(): Distro {
  return normalizeDistro(readStorage(DISTRO_STORAGE_KEY)) ?? 'debian'
}

/**
 * Makes `next` the default and shows this page on it, keeping the hash. A bare
 * URL serves Debian (the proxy sends readers with another default to the explicit
 * URL), so Debian drops the parameter and every other distro sets it.
 */
export function setDefaultDistro(next: Distro) {
  try {
    localStorage.setItem(DISTRO_STORAGE_KEY, next)
  } catch {
    // ignore
  }
  writeCookie(DISTRO_COOKIE, next)
  navigateToDistro(next)
}

export function navigateToDistro(next: Distro) {
  const url = new URL(window.location.href)
  if (next === 'debian') url.searchParams.delete('distro')
  else url.searchParams.set('distro', next)
  showNavigating()
  window.location.replace(url.toString())
}

const NAV_ACTIVE = 'text-xs text-ink-3'

/** The header's "Navigation" status, as the App Router shell shows it while a page loads. */
export function showNavigating() {
  const status = document.querySelector<HTMLElement>('[data-bm-live="navigation"]')
  if (!status) return
  status.className = NAV_ACTIVE
  status.textContent = 'Loading…'
  // A back/forward cache restore brings the page back as it was left.
  window.addEventListener('pageshow', () => {
    status.className = 'sr-only'
    status.textContent = ''
  }, { once: true })
}
