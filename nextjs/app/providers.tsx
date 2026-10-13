'use client'

import type { InfoResponse } from '../lib/api'
import type { Distro } from '../lib/distro'
import type { ReadingPreferences } from '../lib/readingPrefs'
import { AppShell } from '../components/shell/AppShell'
import { DistroProvider } from '../components/state/distro'
import { ReadingPrefsProvider } from '../components/state/readingPrefs'
import { ThemeProvider } from '../components/state/theme'
import { TocProvider } from '../components/state/toc'

export function Providers({
  children,
  initialCookieDistro,
  initialInfo,
  initialReadingPrefs,
}: {
  children: React.ReactNode
  initialCookieDistro?: Distro
  initialInfo?: { distro: Distro; info: InfoResponse } | null
  initialReadingPrefs: ReadingPreferences
}) {
  return (
    <ThemeProvider>
      <ReadingPrefsProvider initialPrefs={initialReadingPrefs}>
        <DistroProvider initialCookieDistro={initialCookieDistro}>
          <TocProvider>
            <AppShell initialInfo={initialInfo}>{children}</AppShell>
          </TocProvider>
        </DistroProvider>
      </ReadingPrefsProvider>
    </ThemeProvider>
  )
}
