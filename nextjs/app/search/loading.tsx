import { Skeleton } from '../../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading search" className="mx-auto max-w-5xl">
      <header className="border-b border-edge pb-6">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-4 h-12 w-full" />
        <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Skeleton key={idx} className="h-7 w-11 rounded-sm" />
          ))}
        </div>
        <Skeleton className="mt-3 h-4 w-80" />
      </header>

      <div className="mt-8 space-y-6" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="space-y-2 border-b border-edge pb-6 last:border-b-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
