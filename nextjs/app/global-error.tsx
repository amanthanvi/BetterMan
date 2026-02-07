'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
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
    <html lang="en">
      <body>
        <div className="min-h-dvh bg-[var(--bm-bg)] px-6 py-16 text-[var(--bm-fg)]">
          <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
            <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Error</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 text-sm text-[color:var(--bm-muted)]">
              Try again, or go back home.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-5 py-2 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
                onClick={() => reset()}
              >
                Retry
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-5 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

