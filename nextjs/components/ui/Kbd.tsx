import type { ReactNode } from 'react'

import { cx } from './cx'

/* The one surviving bordered micro-chip: keyboard-key notation. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center border border-edge bg-transparent px-1.5 font-mono text-xs text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
