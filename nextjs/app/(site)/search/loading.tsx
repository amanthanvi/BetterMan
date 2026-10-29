import { Skeleton } from '../../../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading search" className="mx-auto max-w-[46rem] pt-10">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-6 h-10 w-full" />
      <Skeleton className="mt-4 h-4 w-[85%]" />

      <div className="mt-10" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="grid gap-2 border-t border-rule py-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
