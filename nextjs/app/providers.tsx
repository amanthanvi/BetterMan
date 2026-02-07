'use client'

import { AppShell } from '../components/shell/AppShell'
import { DistroProvider } from '../components/state/distro'
import { ThemeProvider } from '../components/state/theme'
import { TocProvider } from '../components/state/toc'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DistroProvider>
        <TocProvider>
          <AppShell>{children}</AppShell>
        </TocProvider>
      </DistroProvider>
    </ThemeProvider>
  )
}

