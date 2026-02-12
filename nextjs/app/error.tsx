'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import * as Sentry from '@sentry/nextjs'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-6">
        <div className="font-mono text-[11px] tracking-wide text-[color:var(--bm-muted)]">Error</div>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-[color:var(--bm-fg)]">
          Something went wrong
        </h1>
        <p className="mt-3 text-[13px] text-[color:var(--bm-muted)]">Try again, or go back home.</p>
        {error.digest ? (
          <div className="mt-3 font-mono text-[11px] text-[color:var(--bm-muted)]">Digest: {error.digest}</div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="h-10 rounded-md border border-[var(--bm-border-accent)] bg-[var(--bm-accent)] px-4 font-mono text-[13px] font-semibold text-[var(--bm-accent-contrast)] hover:bg-[var(--bm-accent-hover)]"
            onClick={() => reset()}
          >
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 font-mono text-[13px] font-semibold text-[color:var(--bm-fg)] hover:bg-[var(--bm-surface-3)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
