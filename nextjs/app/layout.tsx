import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import './globals.css'
import { fetchInfo } from '../lib/api'
import { DISTRO_COOKIE, normalizeDistro } from '../lib/distro'
import { READING_PREFS_COOKIE, prefsFromCookieString } from '../lib/readingPrefs'
import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL('https://betterman.sh'),
  title: 'BetterMan',
  description: 'Unix manual pages, typeset for the screen.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'BetterMan',
    description: 'Unix manual pages, typeset for the screen.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
  // Keep the bottom-anchored find bar visible above the iOS keyboard.
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()

  const resolved = cookieStore.get('bm-theme-resolved')?.value
  const theme = resolved === 'dark' || resolved === 'light' ? resolved : undefined
  const initialReadingPrefs = prefsFromCookieString(cookieStore.get(READING_PREFS_COOKIE)?.value)

  const cookieDistro = cookieStore.get(DISTRO_COOKIE)?.value
  const initialCookieDistro = normalizeDistro(cookieDistro) ?? undefined

  // Footer info for the cookie distro rides along with SSR (cached 1h);
  // the shell only refetches client-side after a distro switch.
  const infoDistro = initialCookieDistro ?? 'debian'
  const initialInfo = await fetchInfo(infoDistro)
    .then((info) => ({ distro: infoDistro, info }) as const)
    .catch(() => null)

  const nonce = (await headers()).get('x-nonce') ?? undefined
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/geist/GeistSans-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/jetbrains-mono/jetbrainsmono-roman.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="search" type="application/opensearchdescription+xml" title="BetterMan" href="/opensearch.xml" />
      </head>
      <body
        data-bm-font-size={initialReadingPrefs.fontSize}
        data-bm-font-family={initialReadingPrefs.fontFamily}
        data-bm-line-height={initialReadingPrefs.lineHeight}
        data-bm-column-width={initialReadingPrefs.columnWidth}
        data-bm-code-theme={initialReadingPrefs.codeTheme}
        suppressHydrationWarning
      >
        <Providers
          initialCookieDistro={initialCookieDistro}
          initialInfo={initialInfo}
          initialReadingPrefs={initialReadingPrefs}
        >
          {children}
        </Providers>
        {plausibleDomain ? (
          <script defer src="https://plausible.io/js/script.js" data-domain={plausibleDomain} nonce={nonce} />
        ) : null}
      </body>
    </html>
  )
}
