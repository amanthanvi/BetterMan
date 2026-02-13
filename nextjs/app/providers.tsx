'use client'

import type { Distro } from '../lib/distro'
import { AppShell } from '../components/shell/AppShell'
import { DistroProvider } from '../components/state/distro'
import { ReadingPrefsProvider } from '../components/state/readingPrefs'
import { ThemeProvider } from '../components/state/theme'
import { TocProvider } from '../components/state/toc'

export function Providers({
  children,
  initialCookieDistro,
}: {
  children: React.ReactNode
  initialCookieDistro?: Distro
}) {
  return (
    <ThemeProvider>
      <ReadingPrefsProvider>
        <DistroProvider initialCookieDistro={initialCookieDistro}>
          <TocProvider>
            <AppShell>{children}</AppShell>
          </TocProvider>
        </DistroProvider>
      </ReadingPrefsProvider>
    </ThemeProvider>
  )
}
