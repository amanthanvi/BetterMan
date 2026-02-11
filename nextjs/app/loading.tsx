export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-5xl">
      <div className="h-7 w-44 rounded-full bg-[color:var(--bm-surface)/0.75] animate-pulse" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
        <div className="h-4 w-[92%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
        <div className="h-4 w-[86%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.6] animate-pulse" />
        <div className="h-28 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.6] animate-pulse" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

