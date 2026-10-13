import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { cookies, headers } from 'next/headers'
import './globals.css'
import { fetchInfo } from '../lib/api'
import { DISTRO_COOKIE, normalizeDistro } from '../lib/distro'
import { Providers } from './providers'

const geistSans = localFont({
  src: '../public/fonts/geist/GeistSans-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-sans',
  adjustFontFallback: 'Arial',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

const jetBrainsMono = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrainsmono-roman.woff2', weight: '100 800', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrainsmono-italic.woff2', weight: '100 800', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-mono',
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'monospace'],
})

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
    <html lang="en" className={`${geistSans.variable} ${jetBrainsMono.variable}`} data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="search" type="application/opensearchdescription+xml" title="BetterMan" href="/opensearch.xml" />
      </head>
      <body suppressHydrationWarning>
        <Providers initialCookieDistro={initialCookieDistro} initialInfo={initialInfo}>{children}</Providers>
        {plausibleDomain ? (
          <script defer src="https://plausible.io/js/script.js" data-domain={plausibleDomain} nonce={nonce} />
        ) : null}
      </body>
    </html>
  )
}
