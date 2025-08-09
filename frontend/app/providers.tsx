'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { CommandPaletteProvider } from '@/components/providers/command-palette-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
      disableTransitionOnChange
    >
      <CommandPaletteProvider>
        {children}
      </CommandPaletteProvider>
      <Toaster />
    </ThemeProvider>
  )
}