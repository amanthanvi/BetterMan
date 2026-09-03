'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import * as Sentry from '@sentry/nextjs'

import { Button } from '../components/ui/Button'

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
      <div className="mt-8 sm:mt-16">
        <div className="font-mono text-xs tracking-wide text-muted">Error</div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-fg">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted">The page failed to render.</p>
        {error.digest ? <div className="mt-3 font-mono text-xs text-faint">Digest: {error.digest}</div> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="solid" onClick={() => reset()}>
            Retry
          </Button>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center px-1 font-mono text-sm font-medium text-fg underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
