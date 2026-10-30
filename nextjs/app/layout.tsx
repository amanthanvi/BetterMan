import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import './globals.css'
import { DISTRO_COOKIE, normalizeDistro } from '../lib/distro'
import { READING_PREFS_COOKIE, prefsFromCookie } from '../lib/readingPrefs'
import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL('https://betterman.sh'),
  title: 'BetterMan',
  description: 'Unix manual pages, typeset for the screen.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'BetterMan',
    description: 'Unix manual pages, typeset for the screen.',
    type: 'website',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()

  const resolved = cookieStore.get('bm-theme-resolved')?.value
  const theme = resolved === 'dark' || resolved === 'light' ? resolved : undefined

  const readingPrefs = prefsFromCookie(cookieStore.get(READING_PREFS_COOKIE)?.value)

  const initialCookieDistro = normalizeDistro(cookieStore.get(DISTRO_COOKIE)?.value) ?? undefined

  const nonce = (await headers()).get('x-nonce') ?? undefined
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
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
        <Providers initialCookieDistro={initialCookieDistro} initialReadingPrefs={readingPrefs}>
          {children}
        </Providers>
        {plausibleDomain ? (
          <script defer src="/assets/site.js" data-api="/assets/entry" data-domain={plausibleDomain} nonce={nonce} />
        ) : null}
      </body>
    </html>
  )
}
