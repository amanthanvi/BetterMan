import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReadingPrefsProvider, useReadingPrefs } from '../components/state/readingPrefs'
import type { ReadingPreferences } from '../lib/readingPrefs'
import RootLayout from './layout'

const saved: ReadingPreferences = {
  version: 1,
  fontSize: 'large',
  fontFamily: 'mono',
  lineHeight: 'compact',
  columnWidth: 'narrow',
  codeTheme: 'dark',
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'bm-reading-prefs' ? { value: JSON.stringify(saved) } : undefined),
  }),
  headers: async () => ({ get: () => null }),
}))
vi.mock('./providers', () => ({
  Providers: ({ children, initialReadingPrefs }: { children: React.ReactNode; initialReadingPrefs: ReadingPreferences }) => (
    <ReadingPrefsProvider initialPrefs={initialReadingPrefs}>{children}</ReadingPrefsProvider>
  ),
}))

function PrefsProbe() {
  return <output>{useReadingPrefs().prefs.fontSize}</output>
}

describe('RootLayout', () => {
  it('stamps saved reading preferences on the server-rendered body and seeds the provider', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <PrefsProbe /> }))
    expect(html).toContain(
      '<body data-bm-font-size="large" data-bm-font-family="mono" data-bm-line-height="compact" data-bm-column-width="narrow" data-bm-code-theme="dark">',
    )
    expect(html).toContain('<output>large</output>')
  })
})
