export default function Loading() {
  return (
    <div role="status" aria-label="Loading search" className="mx-auto max-w-5xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <div className="h-6 w-28 rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />

        <div className="mt-4 h-12 w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />

        <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-7 w-11 rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse"
            />
          ))}
        </div>

        <div className="mt-3 h-4 w-80 rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
      </header>

      <div className="mt-8 space-y-3" aria-hidden="true">
        <div className="h-28 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />
        <div className="h-28 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />
        <div className="h-28 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] animate-pulse" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
