import Link from 'next/link'

import { Kbd } from '../components/ui/Kbd'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mt-8 sm:mt-16">
        <div className="font-mono text-xs tracking-wide text-muted">404</div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-fg">Not found</h1>
        <p className="mt-3 text-sm text-muted">
          No page at this address. Press <Kbd>⌘K</Kbd> to search.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center px-1 font-mono text-sm font-medium text-fg underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-accent"
          >
            Go home
          </Link>
          <Link
            href="/search"
            className="inline-flex h-9 items-center justify-center px-1 font-mono text-sm font-medium text-fg underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-accent"
          >
            Search
          </Link>
        </div>
      </div>
    </div>
  )
}
