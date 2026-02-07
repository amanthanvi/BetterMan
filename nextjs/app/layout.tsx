import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import Script from 'next/script'

import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'BetterMan',
  description: 'BetterMan is a fast, readable web UI for Linux man pages.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const resolved = cookieStore.get('bm-theme-resolved')?.value
  const theme = resolved === 'dark' || resolved === 'light' ? resolved : undefined
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        {plausibleDomain ? (
          <Script
            src="https://plausible.io/js/script.js"
            data-domain={plausibleDomain}
            strategy="afterInteractive"
            nonce={nonce}
          />
        ) : null}
      </body>
    </html>
  )
}
