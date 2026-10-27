import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  headers: async () => ({ get: () => 'test-nonce' }),
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
  afterEach(() => vi.unstubAllEnvs())

  it('loads only a deferred same-origin tracker with the request nonce', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', 'betterman.sh')
    const html = renderToStaticMarkup(await RootLayout({ children: null }))
    expect(html).toContain('<script defer="" src="/assets/site.js" data-api="/assets/entry" data-domain="betterman.sh" nonce="test-nonce"></script>')
    expect(html).not.toContain('plausible.io')
  })

  it('omits the tracker when analytics is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLAUSIBLE_DOMAIN', '')
    expect(renderToStaticMarkup(await RootLayout({ children: null }))).not.toContain('/assets/site.js')
  })
  it('stamps saved reading preferences on the server-rendered body and seeds the provider', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <PrefsProbe /> }))
    expect(html).toContain(
      '<body data-bm-font-size="large" data-bm-font-family="mono" data-bm-line-height="compact" data-bm-column-width="narrow" data-bm-code-theme="dark">',
    )
    expect(html).toContain('<output>large</output>')
  })

  it('advertises the OpenSearch descriptor', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: null }))
    expect(html).toContain(
      '<link rel="search" type="application/opensearchdescription+xml" title="BetterMan" href="/opensearch.xml"/>',
    )
  })
})
