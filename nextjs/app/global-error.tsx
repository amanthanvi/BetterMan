'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { captureClientException } from '../lib/sentryClient'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureClientException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink">
        <div className="mx-auto max-w-[46rem] px-5 py-16">
          <div className="pt-[12vh]">
            <h1 className="font-serif text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-3 font-serif text-lg text-ink-2">Try again, or go back home.</p>
            {error.digest ? <p className="mt-3 font-mono text-xs text-ink-3">Digest: {error.digest}</p> : null}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <button
                type="button"
                className="h-9 bg-ink px-3 text-sm text-paper transition-colors hover:bg-ink-2"
                onClick={() => reset()}
              >
                Retry
              </button>
              <Link
                href="/"
                className="text-sm underline"
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
