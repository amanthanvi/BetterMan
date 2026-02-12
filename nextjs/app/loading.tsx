export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-5xl">
      <div className="h-6 w-44 rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-[92%] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-[86%] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />
        <div className="h-28 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
