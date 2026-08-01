import { Skeleton } from '../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-3xl">
      <Skeleton className="mt-2 h-3 w-full" />
      <div className="mt-10">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-3 ml-6 h-4 w-72 sm:ml-8" />
      </div>
      <div className="mt-10">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 ml-6 h-10 w-[85%] sm:ml-8" />
      </div>
      <div className="mt-12 space-y-10">
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 ml-6 h-4 w-full sm:ml-8" />
          <Skeleton className="mt-2 ml-6 h-4 w-[85%] sm:ml-8" />
          <Skeleton className="mt-2 ml-6 h-4 w-[70%] sm:ml-8" />
        </div>
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 ml-6 h-4 w-full sm:ml-8" />
          <Skeleton className="mt-2 ml-6 h-4 w-[80%] sm:ml-8" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
