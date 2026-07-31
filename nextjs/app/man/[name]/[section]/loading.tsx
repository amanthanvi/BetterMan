import { Skeleton } from '../../../../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading man page" className="mx-auto max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-[min(34rem,92%)]" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="size-9" />
          ))}
        </div>
      </div>

      <Skeleton className="mt-6 h-24 w-full" />

      <div className="mt-10 space-y-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[86%]" />
        <Skeleton className="h-4 w-[80%]" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
