import type { ButtonHTMLAttributes } from 'react'

import { cx } from './cx'

export type ButtonVariant = 'solid' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md'

/* Text-first controls: 'outline' is an underlined text action, 'ghost' is
   quiet ink. 'solid' is ink on paper reversed, for the rare primary (error Retry);
   the red stays for selection, focus and warnings. */
const VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-ink px-3 text-paper hover:bg-ink-2',
  outline: 'text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent',
  ghost: 'text-ink-2 hover:text-ink',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 text-sm',
  md: 'h-9 gap-2 text-sm',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  )
}
