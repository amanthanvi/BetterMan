import { Skeleton } from '../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-3xl">
      <div className="mt-8 sm:mt-16">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
        <Skeleton className="mt-6 h-12 w-full" />
      </div>
      <div className="mt-12 space-y-10">
        <div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-24 w-full rounded-lg" />
        </div>
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-24 w-full rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
