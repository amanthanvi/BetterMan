import type { Metadata } from 'next'
import { cookies } from 'next/headers'

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

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
