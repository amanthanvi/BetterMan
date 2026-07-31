import type { ButtonHTMLAttributes } from 'react'

import { cx } from './cx'

export type ButtonVariant = 'solid' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-accent text-accent-contrast hover:bg-accent-hover',
  outline: 'border border-edge bg-surface text-fg hover:border-edge-strong hover:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-sm',
  md: 'h-9 gap-2 px-3 text-sm',
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
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}
