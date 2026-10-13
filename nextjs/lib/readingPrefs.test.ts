import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReadingPrefsProvider, useReadingPrefs } from '../components/state/readingPrefs'
import {
  DEFAULT_PREFS,
  READING_PREFS_COOKIE,
  READING_PREFS_EVENT,
  READING_PREFS_STORAGE_KEY,
  getReadingPrefs,
  prefsFromCookieString,
  resetReadingPrefs,
  setReadingPrefs,
  syncReadingPrefsCookie,
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
    let stored: string | null = null
    const setItem = vi.fn((_key: string, value: string) => { stored = value })
    const document = { cookie: '' }
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem })
    vi.stubGlobal('document', document)
    setReadingPrefs(savedPrefs)
    expect(setItem).toHaveBeenLastCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(savedPrefs))
    expect(document.cookie).toBe(`${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
    expect(getReadingPrefs()).toEqual(savedPrefs)
    resetReadingPrefs()
    expect(setItem).toHaveBeenLastCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(DEFAULT_PREFS))
    expect(document.cookie).toBe(`${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(DEFAULT_PREFS))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
    expect(getReadingPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('still writes the cookie when localStorage writes fail', () => {
    const document = { cookie: '' }
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
    vi.stubGlobal('document', document)
    setReadingPrefs(savedPrefs)
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(savedPrefs)
  })

  it.each(['throw', 'stale'])('keeps the reset event value and cookie when readable storage stays stale (%s write)', (writeFailure) => {
    const window = new EventTarget()
    let consumerPrefs = savedPrefs
    // Exercise the emitted-value contract without claiming a mounted provider.
    const onChange = vi.fn((event: Event) => {
      consumerPrefs = (event as CustomEvent<ReadingPreferences>).detail
    })
    window.addEventListener(READING_PREFS_EVENT, onChange)
    vi.stubGlobal('window', window)
    const getItem = vi.fn(() => JSON.stringify(savedPrefs))
    const setItem = vi.fn(() => {
      if (writeFailure === 'throw') throw new Error('quota exceeded')
    })
    vi.stubGlobal('localStorage', {
      getItem,
      setItem,
    })
    let cookie = `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}`
    const writeCookie = vi.fn((value: string) => { cookie = value })
    const document = { get cookie() { return cookie }, set cookie(value: string) { writeCookie(value) } }
    vi.stubGlobal('document', document)
    expect(getReadingPrefs()).toEqual(savedPrefs)
    getItem.mockClear()

    resetReadingPrefs()
    expect(setItem).toHaveBeenCalledExactlyOnceWith(READING_PREFS_STORAGE_KEY, JSON.stringify(DEFAULT_PREFS))
    expect(getItem).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(consumerPrefs).toEqual(DEFAULT_PREFS)
    expect(writeCookie).toHaveBeenCalledExactlyOnceWith(`${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(DEFAULT_PREFS))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(DEFAULT_PREFS)

    // This stale read is the reason a same-tab consumer must use event.detail.
    expect(getReadingPrefs()).toEqual(savedPrefs)
    expect(consumerPrefs).toEqual(DEFAULT_PREFS)
    expect(writeCookie).toHaveBeenCalledTimes(1)
  })

  it('reads reset defaults from the cookie when storage writes and subsequent reads fail', () => {
    let blocked = false
    const setItem = vi.fn(() => { blocked = true; throw new Error('blocked') })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        if (blocked) throw new Error('blocked')
        return JSON.stringify(savedPrefs)
      },
      setItem,
    })
    const document = { cookie: `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(savedPrefs))}` }
    vi.stubGlobal('document', document)
    expect(getReadingPrefs()).toEqual(savedPrefs)

    expect(() => resetReadingPrefs()).not.toThrow()
    expect(setItem).toHaveBeenCalledExactlyOnceWith(READING_PREFS_STORAGE_KEY, JSON.stringify(DEFAULT_PREFS))
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(DEFAULT_PREFS)
    expect(getReadingPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('mirrors legacy storage preferences to the cookie without writing storage or emitting a change', () => {
    const window = new EventTarget()
    const onChange = vi.fn()
    window.addEventListener(READING_PREFS_EVENT, onChange)
    vi.stubGlobal('window', window)
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(savedPrefs), setItem })
    const document = { cookie: '' }
    vi.stubGlobal('document', document)

    syncReadingPrefsCookie(getReadingPrefs())
    expect(prefsFromCookieString(document.cookie.split(';')[0].slice(`${READING_PREFS_COOKIE}=`.length))).toEqual(savedPrefs)
    expect(setItem).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('still writes localStorage when cookies are blocked', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('document', { set cookie(_value: string) { throw new Error('blocked') } })
    expect(() => setReadingPrefs(savedPrefs)).not.toThrow()
    expect(setItem).toHaveBeenCalledWith(READING_PREFS_STORAGE_KEY, JSON.stringify(savedPrefs))
  })
})

describe('ReadingPrefsProvider server render', () => {
  it.each([DEFAULT_PREFS, savedPrefs])('uses initialPrefs without reading or changing browser persistence: %j', (initialPrefs) => {
    const getItem = vi.fn(() => JSON.stringify(initialPrefs === DEFAULT_PREFS ? savedPrefs : DEFAULT_PREFS))
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem, setItem })
    const cookie = `${READING_PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(DEFAULT_PREFS))}`
    const document = { cookie }
    vi.stubGlobal('document', document)
    let renderedPrefs: ReadingPreferences | undefined
    function Consumer() {
      renderedPrefs = useReadingPrefs().prefs
      return createElement('span', null, renderedPrefs.fontSize)
    }

    const providerProps = { initialPrefs, children: createElement(Consumer) }
    const html = renderToStaticMarkup(createElement(ReadingPrefsProvider, providerProps))
    expect(renderedPrefs).toEqual(initialPrefs)
    expect(html).toBe(`<span>${initialPrefs.fontSize}</span>`)
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).toBe(cookie)
  })
})
