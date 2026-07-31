import type { ButtonHTMLAttributes } from 'react'

import { cx } from './cx'

const VARIANT = {
  outline: 'border border-edge bg-surface text-muted hover:border-edge-strong hover:bg-raised hover:text-fg',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
} as const

const SIZE = {
  sm: 'size-8',
  md: 'size-9',
} as const

export function IconButton({
  variant = 'outline',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT
  size?: keyof typeof SIZE
  'aria-label': string
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}
