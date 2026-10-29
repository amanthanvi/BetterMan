import type { ReactNode } from 'react'

import { cx } from './cx'

/* The one surviving bordered micro-chip: keyboard-key notation. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center border border-rule-2 bg-paper px-[0.3em] font-mono text-xs text-ink-2',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
