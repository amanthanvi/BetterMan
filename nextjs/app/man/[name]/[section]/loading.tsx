export default function Loading() {
  return (
    <div role="status" aria-label="Loading man page" className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="h-8 w-56 rounded-full bg-[color:var(--bm-surface)/0.75] animate-pulse" />
          <div className="mt-4 h-4 w-96 max-w-full rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
          <div className="mt-8 space-y-3">
            <div className="h-4 w-full rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
            <div className="h-4 w-[92%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
            <div className="h-4 w-[88%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
            <div className="h-4 w-[83%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
          </div>
          <div className="mt-10 space-y-3">
            <div className="h-5 w-32 rounded-full bg-[color:var(--bm-surface)/0.7] animate-pulse" />
            <div className="h-4 w-full rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
            <div className="h-4 w-[90%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
            <div className="h-4 w-[84%] rounded-full bg-[color:var(--bm-surface)/0.55] animate-pulse" />
          </div>
        </div>

        <div className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-4 overflow-hidden pr-2">
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.6] p-4 animate-pulse">
              <div className="h-4 w-24 rounded-full bg-[color:var(--bm-bg)/0.45]" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded-full bg-[color:var(--bm-bg)/0.45]" />
                <div className="h-3 w-[92%] rounded-full bg-[color:var(--bm-bg)/0.45]" />
                <div className="h-3 w-[86%] rounded-full bg-[color:var(--bm-bg)/0.45]" />
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.6] p-4 animate-pulse">
              <div className="h-4 w-16 rounded-full bg-[color:var(--bm-bg)/0.45]" />
              <div className="mt-4 h-8 w-full rounded-full bg-[color:var(--bm-bg)/0.45]" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

