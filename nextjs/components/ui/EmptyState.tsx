import type { ReactNode } from 'react'

import { cx } from './cx'

export function EmptyState({
  title,
  children,
  className,
}: {
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('py-1 text-sm text-ink-3', className)}>
      <p className="font-serif text-base italic text-ink-2">{title}</p>
      {children ? <p className="mt-1">{children}</p> : null}
    </div>
  )
}
