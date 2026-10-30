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

afterEach(() => vi.unstubAllEnvs())

describe('RootLayout', () => {

  it('loads only a deferred same-origin tracker with the request nonce', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js', eventEndpoint: '/project-intake/event', viewEndpoint: '/project-intake/view' } }))
    const html = renderToStaticMarkup(await RootLayout({ children: null }))
    expect(html).toContain('<script defer="" src="/project-intake/script.js" data-event-endpoint="/project-intake/event" data-view-endpoint="/project-intake/view" nonce="test-nonce"></script>')
    expect(html).toContain('<script nonce="test-nonce">window.va=')
  })

  it.each(['preview', 'development', ''])('omits analytics outside Vercel production (%s)', async (env) => {
    vi.stubEnv('VERCEL_ENV', env)
    vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: '/project-intake/script.js' } }))
    const html = renderToStaticMarkup(await RootLayout({ children: null }))
    expect(html).not.toContain('window.va=')
    expect(html).not.toContain('/project-intake/')
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

it('emits no analytics in production until project configuration is available', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', '')
  expect(renderToStaticMarkup(await RootLayout({ children: null }))).not.toContain('window.va=')
})
