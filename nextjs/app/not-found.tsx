import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-6">
        <div className="font-mono text-[11px] tracking-wide text-[color:var(--bm-muted)]">404</div>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-[color:var(--bm-fg)]">Not found</h1>
        <p className="mt-3 text-[13px] text-[color:var(--bm-muted)]">That page doesn&apos;t exist.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 font-mono text-[13px] font-semibold text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)]"
          >
            Go home
          </Link>
          <Link
            href="/search"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 font-mono text-[13px] font-semibold text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)]"
          >
            Search
          </Link>
        </div>
      </div>
    </div>
  )
}
