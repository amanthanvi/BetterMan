import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">404</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-3 text-sm text-[color:var(--bm-muted)]">That page doesn&apos;t exist.</p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
