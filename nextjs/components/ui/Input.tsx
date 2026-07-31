import type { InputHTMLAttributes } from 'react'

import { cx } from './cx'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-9 w-full min-w-0 rounded-md border border-edge bg-surface px-3 text-sm text-fg transition-colors',
        'placeholder:text-muted hover:border-edge-strong',
        className,
      )}
      {...props}
    />
  )
}
