'use client'

import { CommandPalette } from '@/components/command-palette/command-palette'

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
    </>
  )
}