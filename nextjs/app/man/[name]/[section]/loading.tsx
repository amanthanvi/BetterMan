export default function Loading() {
  return (
    <div role="status" aria-label="Loading man page" className="mx-auto max-w-5xl">
      <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-5 animate-pulse">
        <div className="h-9 w-64 rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-3)]" />
        <div className="mt-3 h-4 w-[min(34rem,92%)] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-3)]" />
        <div className="mt-6 h-24 w-full rounded-[var(--bm-radius)] border border-[var(--bm-code-border)] bg-[#0d0d0d]" />
      </div>

      <div className="mt-10 space-y-3">
        <div className="h-5 w-44 rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-full rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-[92%] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-[86%] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
        <div className="h-4 w-[80%] rounded-[var(--bm-radius-sm)] bg-[var(--bm-surface-2)] animate-pulse" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
