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
      <body className="min-h-dvh bg-bg text-fg">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-md border border-edge bg-raised p-6">
            <div className="font-mono text-xs tracking-wide text-muted">Error</div>
            <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-fg">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-muted">Try again, or go back home.</p>
            {error.digest ? (
              <div className="mt-3 font-mono text-xs text-muted">Digest: {error.digest}</div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="h-10 rounded-md border border-accent-edge bg-surface px-4 font-mono text-sm font-semibold text-accent hover:bg-raised"
                onClick={() => reset()}
              >
                Retry
              </button>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-md border border-edge bg-surface px-4 font-mono text-sm font-semibold text-fg hover:bg-raised"
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
