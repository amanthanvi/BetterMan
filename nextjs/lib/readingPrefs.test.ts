import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PREFS,
  READING_PREFS_COOKIE,
  READING_PREFS_EVENT,
  READING_PREFS_STORAGE_KEY,
  getReadingPrefs,
  prefsFromCookieString,
  resetReadingPrefs,
  setReadingPrefs,
} from './readingPrefs'
import type { ReadingPreferences } from './readingPrefs'

const savedPrefs: ReadingPreferences = {
  version: 1,
  fontSize: 'large',
  fontFamily: 'serif',
  lineHeight: 'relaxed',
  columnWidth: 'wide',
  codeTheme: 'dark',
}

afterEach(() => vi.unstubAllGlobals())

describe('prefsFromCookieString', () => {
  it('uses the design and SSR defaults', () => {
    expect(DEFAULT_PREFS).toEqual({
      version: 1,
      fontSize: 'medium',
      fontFamily: 'sans',
      lineHeight: 'normal',
      columnWidth: 'normal',
      codeTheme: 'auto',
    })
  })

  it('accepts valid JSON and URL-encoded JSON', () => {
    expect(prefsFromCookieString(JSON.stringify(savedPrefs))).toEqual(savedPrefs)
    expect(prefsFromCookieString(encodeURIComponent(JSON.stringify(savedPrefs)))).toEqual(savedPrefs)
  })

  it.each([undefined, null, '', 'garbage', '{', '%E0%A4%A', 'null', '[]', '1'])('falls back silently for %s', (raw) => {
    expect(prefsFromCookieString(raw)).toEqual(DEFAULT_PREFS)
  })

  it.each(Object.keys(savedPrefs))('rejects a missing %s field', (key) => {
    const incomplete: Record<string, unknown> = { ...savedPrefs }
    delete incomplete[key]
    expect(prefsFromCookieString(encodeURIComponent(JSON.stringify(incomplete)))).toEqual(DEFAULT_PREFS)
  })

  it('rejects a version mismatch', () => {
    expect(prefsFromCookieString(JSON.stringify({ ...savedPrefs, version: 2 }))).toEqual(DEFAULT_PREFS)
  })

  it.each(['fontSize', 'fontFamily', 'lineHeight', 'columnWidth', 'codeTheme'])('rejects invalid %s values', (key) => {
    expect(prefsFromCookieString(JSON.stringify({ ...savedPrefs, [key]: 'unsupported' }))).toEqual(DEFAULT_PREFS)
  })
})

describe('reading preference persistence', () => {
  it('uses localStorage over a conflicting cookie', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(savedPrefs) })
    vi.stubGlobal('document', { cookie: `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(DEFAULT_PREFS))}` })
    expect(getReadingPrefs()).toEqual(savedPrefs)
  })

  it('falls back to the cookie when localStorage is absent', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('document', { cookie: `other=1; ${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}; last=2` })
    expect(getReadingPrefs()).toEqual(savedPrefs)
  })

  it('falls back to the cookie when localStorage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    vi.stubGlobal('document', { cookie: `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}` })
    expect(getReadingPrefs()).toEqual(savedPrefs)
  })

  it('uses defaults for malformed localStorage, even with a valid cookie', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'garbage' })
    vi.stubGlobal('document', { cookie: `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}` })
    expect(getReadingPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('writes URL-encoded preferences and resets both persistence stores', () => {
    const setItem = vi.fn()
    const document = { cookie: '' }
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('document', document)
    setReadingPrefs(savedPrefs)
    expect(setItem).toHaveBeenLastCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(savedPrefs))
    expect(document.cookie).toBe(`${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
    resetReadingPrefs()
    expect(setItem).toHaveBeenLastCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(DEFAULT_PREFS))
    expect(document.cookie).toBe(`${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(DEFAULT_PREFS))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
  })

  it('still writes the cookie when localStorage writes fail', () => {
    const document = { cookie: '' }
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
    vi.stubGlobal('document', document)
    setReadingPrefs(savedPrefs)
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(savedPrefs)
  })

  it('notifies the provider with the new value when storage remains readable but writes fail', () => {
    const window = new EventTarget()
    const onChange = vi.fn((event: Event) => (event as CustomEvent<ReadingPreferences>).detail)
    window.addEventListener(READING_PREFS_EVENT, onChange)
    vi.stubGlobal('window', window)
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify(savedPrefs),
      setItem: () => { throw new Error('quota exceeded') },
    })
    const document = { cookie: '' }
    vi.stubGlobal('document', document)
    resetReadingPrefs()
    expect(onChange).toHaveReturnedWith(DEFAULT_PREFS)
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(DEFAULT_PREFS)
  })

  it('still writes localStorage when cookies are blocked', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('document', { set cookie(_value: string) { throw new Error('blocked') } })
    expect(() => setReadingPrefs(savedPrefs)).not.toThrow()
    expect(setItem).toHaveBeenCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(savedPrefs))
  })
})
