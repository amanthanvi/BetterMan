import type { Metadata } from 'next'
import Link from 'next/link'

import './globals.css'

export const metadata: Metadata = {
  title: 'BetterMan',
  description: 'BetterMan is a fast, readable web UI for Linux man pages.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-dvh bg-[var(--bm-bg)] text-[var(--bm-fg)]">
          <header className="border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="text-base font-semibold tracking-tight">
                BetterMan
              </Link>
              <nav className="text-sm text-[color:var(--bm-muted)]">
                <Link href="/search" className="hover:underline hover:underline-offset-4">
                  Search
                </Link>
              </nav>
            </div>
          </header>
          <main className="px-4 py-10">{children}</main>
        </div>
      </body>
    </html>
  )
}
