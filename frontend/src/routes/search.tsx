import { createRoute } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: SearchPage,
})

function SearchPage() {
  const { q } = searchRoute.useSearch()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
        Query: <span className="font-medium text-[var(--bm-fg)]">{q || '—'}</span>
      </p>
      <div className="mt-8 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        UI + API integration next.
      </div>
    </div>
  )
}

