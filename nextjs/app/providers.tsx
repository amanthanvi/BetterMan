'use client'

import type { InfoResponse } from '../lib/api'
import type { Distro } from '../lib/distro'
import { AppShell } from '../components/shell/AppShell'
import { DistroProvider } from '../components/state/distro'
import { ReadingPrefsProvider } from '../components/state/readingPrefs'
import { ThemeProvider } from '../components/state/theme'
import { TocProvider } from '../components/state/toc'

export function Providers({
  children,
  initialCookieDistro,
  initialInfo,
}: {
  children: React.ReactNode
  initialCookieDistro?: Distro
  initialInfo?: { distro: Distro; info: InfoResponse } | null
}) {
  return (
    <ThemeProvider>
      <ReadingPrefsProvider>
        <DistroProvider initialCookieDistro={initialCookieDistro}>
          <TocProvider>
            <AppShell initialInfo={initialInfo}>{children}</AppShell>
          </TocProvider>
        </DistroProvider>
      </ReadingPrefsProvider>
    </ThemeProvider>
  )
}
