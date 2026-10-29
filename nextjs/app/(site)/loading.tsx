import { Skeleton } from '../../components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-[40rem] pt-[10vh] md:pt-[14vh]">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-4 h-5 w-80" />
      <Skeleton className="mt-12 h-10 w-full" />
      <div className="mt-14 grid gap-10 sm:grid-cols-2 sm:gap-8">
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-[80%]" />
        </div>
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-4 w-[90%]" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
