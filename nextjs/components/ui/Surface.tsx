import type { HTMLAttributes } from 'react'

import { cx } from './cx'

export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <div className={cx('rounded-lg border border-edge bg-surface', className)} {...props} />
}
