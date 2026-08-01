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
    <div className={cx('py-1 text-sm', className)}>
      <div className="font-mono text-xs tracking-wide text-muted">{title}</div>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  )
}
