import { cx } from './cx'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-md bg-edge', className)} />
}
