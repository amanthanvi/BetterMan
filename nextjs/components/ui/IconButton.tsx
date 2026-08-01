import type { ButtonHTMLAttributes } from 'react'

import { cx } from './cx'

/* Unboxed glyphs: hover is an ink change, never a border or fill. The size
   classes preserve the hit target. */
const VARIANT = {
  outline: 'text-muted hover:text-fg',
  ghost: 'text-muted hover:text-fg',
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
        'inline-flex shrink-0 items-center justify-center transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}
