import { createRoute, Link } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

function IndexPage() {
  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Man pages, but sane.</h1>
      <p className="mt-3 text-base text-[color:var(--bm-muted)]">
        BetterMan is a fast, readable, keyboard-first web UI for Linux man pages.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/search"
          search={{ q: 'tar' }}
          className="inline-flex items-center justify-center rounded-md bg-[var(--bm-accent)] px-4 py-2 text-sm font-medium text-[var(--bm-accent-contrast)] hover:opacity-90"
        >
          Try a search
        </Link>
        <div className="text-sm text-[color:var(--bm-muted)]">
          Example: <span className="font-medium text-[var(--bm-fg)]">ssh_config</span>,{' '}
          <span className="font-medium text-[var(--bm-fg)]">curl</span>
        </div>
      </div>
    </div>
  )
}

