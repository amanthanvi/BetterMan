import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PREFS,
  READING_PREFS_COOKIE,
  READING_PREFS_STORAGE_KEY,
  prefsFromCookie,
  resetReadingPrefs,
  restoreReadingPrefs,
  setReadingPrefs,
} from './readingPrefs'
import type { ReadingPreferences } from './readingPrefs'

const saved: ReadingPreferences = {
  version: 1,
  fontSize: 'large',
  fontFamily: 'mono',
  lineHeight: 'compact',
  columnWidth: 'wide',
  codeTheme: 'dark',
}

function stubBrowser(stored: string | null) {
  const store = new Map<string, string>()
  if (stored !== null) store.set(READING_PREFS_STORAGE_KEY, stored)
  const cookieWrites: string[] = []
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  })
  vi.stubGlobal('document', {
    set cookie(value: string) {
      cookieWrites.push(value)
    },
  })
  return { store, cookieWrites }
}

afterEach(() => vi.unstubAllGlobals())

describe('prefsFromCookie', () => {
  it('defaults to the CSS fallback typography', () => {
    expect(DEFAULT_PREFS).toMatchObject({ fontFamily: 'sans', lineHeight: 'normal' })
  })

  it('parses a saved cookie value', () => {
    expect(prefsFromCookie(JSON.stringify(saved))).toEqual(saved)
  })

  it.each([
    undefined,
    '',
    'garbage',
    'null',
    JSON.stringify({ ...saved, version: 2 }),
    JSON.stringify({ ...saved, fontFamily: 'comic' }),
  ])('falls back to defaults for %s', (raw) => {
    expect(prefsFromCookie(raw)).toEqual(DEFAULT_PREFS)
  })
})

describe('reading preference persistence', () => {
  it('does not write a cookie for visitors without saved preferences', () => {
    const { cookieWrites } = stubBrowser(null)
    expect(restoreReadingPrefs()).toBeNull()
    expect(cookieWrites).toEqual([])
  })

  it('does not write a cookie when stored preferences are invalid', () => {
    const { cookieWrites } = stubBrowser('garbage')
    expect(restoreReadingPrefs()).toBeNull()
    expect(cookieWrites).toEqual([])
  })

  it('prefers localStorage and refreshes the cookie from it', () => {
    const { cookieWrites } = stubBrowser(JSON.stringify(saved))
    expect(restoreReadingPrefs()).toEqual(saved)
    expect(cookieWrites).toEqual([
      `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(saved))}; Path=/; Max-Age=31536000; SameSite=Lax`,
    ])
  })

  it('saves to both stores, and reset clears both instead of saving the defaults', () => {
    const { store, cookieWrites } = stubBrowser(null)
    setReadingPrefs(saved)
    expect(store.get(READING_PREFS_STORAGE_KEY)).toBe(JSON.stringify(saved))
    expect(prefsFromCookie(decodeURIComponent(cookieWrites[0].split(';')[0].split('=')[1]))).toEqual(saved)

    resetReadingPrefs()
    expect(store.has(READING_PREFS_STORAGE_KEY)).toBe(false)
    expect(cookieWrites[1]).toBe(`${READING_PREFS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
  })
})
