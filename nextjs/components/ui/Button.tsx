import type { ButtonHTMLAttributes } from 'react'

import { cx } from './cx'

export type ButtonVariant = 'solid' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md'

/* Text-first controls: 'outline' is an underlined text action, 'ghost' is
   quiet ink. 'solid' survives only for the rare primary (e.g. error Retry). */
const VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-accent px-3 text-accent-contrast hover:bg-accent-hover',
  outline: 'bg-transparent text-fg underline underline-offset-4 decoration-edge-strong hover:decoration-accent',
  ghost: 'text-muted hover:text-fg',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-1 text-sm',
  md: 'h-9 gap-2 px-1 text-sm',
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
        'inline-flex shrink-0 items-center justify-center font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  )
}
