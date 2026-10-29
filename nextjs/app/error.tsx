'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { captureClientException } from '../lib/sentryClient'

import { Button } from '../components/ui/Button'

export default function Error({
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
    <div className="mx-auto max-w-[46rem]">
      <div className="pt-[12vh]">
        <h1 className="font-serif text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 font-serif text-lg text-ink-2">The page failed to render.</p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-ink-3">Digest: {error.digest}</p> : null}
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Button variant="solid" onClick={() => reset()}>
            Retry
          </Button>
          <Link
            href="/"
            className="text-sm underline"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
