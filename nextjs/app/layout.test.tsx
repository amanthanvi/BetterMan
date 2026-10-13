import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReadingPrefsProvider, useReadingPrefs } from '../components/state/readingPrefs'
import { DEFAULT_PREFS, READING_PREFS_COOKIE } from '../lib/readingPrefs'
import type { ReadingPreferences } from '../lib/readingPrefs'
import RootLayout from './layout'

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
  headers: async () => ({ get: () => null }),
}))
vi.mock('../lib/api', () => ({ fetchInfo: async () => { throw new Error('No dataset needed') } }))
vi.mock('./providers', () => ({
  Providers: ({ children, initialReadingPrefs }: { children: React.ReactNode; initialReadingPrefs: ReadingPreferences }) => (
    <ReadingPrefsProvider initialPrefs={initialReadingPrefs}>{children}</ReadingPrefsProvider>
  ),
}))

function PrefsProbe() {
  return <output>{JSON.stringify(useReadingPrefs().prefs)}</output>
}

afterEach(() => {
  vi.unstubAllGlobals()
  cookieGet.mockReset()
})

describe('reading preference SSR bridge', () => {
  it.each([undefined, 'garbage'])('renders design defaults for missing or invalid cookies (%s)', async (raw) => {
    cookieGet.mockImplementation((name: string) => name === READING_PREFS_COOKIE ? { value: raw } : undefined)
    const html = renderToStaticMarkup(await RootLayout({ children: <PrefsProbe /> }))
    expect(html).toContain('data-bm-font-size="medium"')
    expect(html).toContain('data-bm-font-family="sans"')
    expect(html).toContain('data-bm-line-height="normal"')
    expect(html).toContain('data-bm-column-width="normal"')
    expect(html).toContain('data-bm-code-theme="auto"')
  })

  it('renders all saved axes before effects and seeds provider state from the same value', async () => {
    const prefs: ReadingPreferences = {
      version: 1,
      fontSize: 'large',
      fontFamily: 'mono',
      lineHeight: 'compact',
      columnWidth: 'narrow',
      codeTheme: 'dark',
    }
    cookieGet.mockImplementation((name: string) => name === READING_PREFS_COOKIE ? { value: encodeURIComponent(JSON.stringify(prefs)) } : undefined)
    // A conflicting browser store must not affect the initial provider render.
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(DEFAULT_PREFS) })
    const html = renderToStaticMarkup(await RootLayout({ children: <PrefsProbe /> }))
    expect(html).toContain('data-bm-font-size="large"')
    expect(html).toContain('data-bm-font-family="mono"')
    expect(html).toContain('data-bm-line-height="compact"')
    expect(html).toContain('data-bm-column-width="narrow"')
    expect(html).toContain('data-bm-code-theme="dark"')
    expect(html).toContain(`<output>${JSON.stringify(prefs).replaceAll('"', '&quot;')}</output>`)
  })
})
