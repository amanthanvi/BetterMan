import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import './globals.css'
import { DISTRO_COOKIE, normalizeDistro } from '../lib/distro'
import { publicLangs } from '../lib/i18n/gate'
import { LangNav } from '../components/shell/LangNav'
import { expandPlurals } from '../lib/i18n/expand'
import { requestLangFromHeaders } from '../lib/i18n/request'
import { getI18n } from '../lib/i18n/server'
import { READING_PREFS_COOKIE, prefsFromCookie } from '../lib/readingPrefs'
import { AnalyticsScripts } from '../components/AnalyticsScripts'
import { Providers } from './providers'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n(requestLangFromHeaders(await headers()))
  const description = t('Unix manual pages, typeset for the screen.')
  return {
    metadataBase: new URL('https://betterman.sh'),
    title: 'BetterMan',
    description,
    manifest: '/site.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/apple-touch-icon.png',
    },
    openGraph: { title: 'BetterMan', description, type: 'website' },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()

  const resolved = cookieStore.get('bm-theme-resolved')?.value
  const theme = resolved === 'dark' || resolved === 'light' ? resolved : undefined

  const readingPrefs = prefsFromCookie(cookieStore.get(READING_PREFS_COOKIE)?.value)

  const initialCookieDistro = normalizeDistro(cookieStore.get(DISTRO_COOKIE)?.value) ?? undefined

  const requestHeaders = await headers()
  const nonce = requestHeaders.get('x-nonce') ?? undefined
  // The language comes from the URL alone (the proxy hands it over as a header); a cookie never picks it.
  const available = publicLangs()
  const lang = requestLangFromHeaders(requestHeaders, available)
  const { t, catalog } = await getI18n(lang)
  const messages = lang === 'en' ? undefined : expandPlurals(catalog.client)

  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning>
      <head>
        <AnalyticsScripts nonce={nonce} />
        {/* The manual's roman, Latin range. Other ranges and the italic load when a page uses them. */}
        <link
          rel="preload"
          href="/fonts/bm-text/bm-text-roman-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="search" type="application/opensearchdescription+xml" title="BetterMan" href="/opensearch.xml" />
      </head>
      <body
        data-bm-font-size={readingPrefs.fontSize}
        data-bm-font-family={readingPrefs.fontFamily}
        data-bm-line-height={readingPrefs.lineHeight}
        data-bm-column-width={readingPrefs.columnWidth}
        data-bm-code-theme={readingPrefs.codeTheme}
        suppressHydrationWarning
      >
        <Providers
          initialCookieDistro={initialCookieDistro}
          initialReadingPrefs={readingPrefs}
          lang={lang}
          messages={messages}
          publicLangs={available}
          langNav={<LangNav t={t} lang={lang} langs={available} />}
        >
          {children}
        </Providers>
      </body>
    </html>
  )
}
