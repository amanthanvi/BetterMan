import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import './globals.css'
import { normalizeDistro } from '../lib/distro'
import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL('https://betterman.sh'),
  title: 'BetterMan',
  description: 'BetterMan is a fast, readable web UI for Linux man pages.',
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'BetterMan',
    description: 'BetterMan is a fast, readable web UI for Linux man pages.',
    type: 'website',
    images: ['/og-image.png'],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()

  const resolved = cookieStore.get('bm-theme-resolved')?.value
  const theme = resolved === 'dark' || resolved === 'light' ? resolved : undefined

  const cookieDistro = cookieStore.get('bm-distro')?.value
  const initialCookieDistro = normalizeDistro(cookieDistro) ?? undefined

  const nonce = (await headers()).get('x-nonce') ?? undefined
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <Providers initialCookieDistro={initialCookieDistro}>{children}</Providers>
        {plausibleDomain ? (
          <script defer src="https://plausible.io/js/script.js" data-domain={plausibleDomain} nonce={nonce} />
        ) : null}
      </body>
    </html>
  )
}
