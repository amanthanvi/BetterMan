import { useInfiniteQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'

import { listSection } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { rootRoute } from './__root'

export const sectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/section/$section',
  component: SectionPage,
})

function SectionPage() {
  const { section } = sectionRoute.useParams()
  const limit = 200

  const q = useInfiniteQuery({
    queryKey: queryKeys.section(section),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listSection(section, { limit, offset: typeof pageParam === 'number' ? pageParam : 0 }),
    getNextPageParam: (lastPage, pages) => {
      const nextOffset = pages.reduce((sum, page) => sum + page.results.length, 0)
      if (nextOffset >= lastPage.total) return undefined
      return nextOffset >= 5000 ? undefined : nextOffset
    },
  })

  if (q.isLoading) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (q.isError) {
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Section not found.
      </div>
    )
  }

  if (!q.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const first = q.data.pages[0]
  const results = q.data.pages.flatMap((p) => p.results)

  return (
    <div className="mx-auto max-w-4xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Section {first.section} <span className="text-[color:var(--bm-muted)]">— {first.label}</span>
        </h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
          {first.total.toLocaleString()} pages
        </p>
      </header>

      <ol className="mt-8 columns-1 gap-6 sm:columns-2">
        {results.map((r) => (
          <li key={`${r.name}:${r.section}`} className="break-inside-avoid py-1">
            <Link
              to="/man/$name/$section"
              params={{ name: r.name, section: r.section }}
              className="font-medium tracking-tight"
            >
              {r.name}({r.section})
            </Link>
            <div className="mt-0.5 text-xs text-[color:var(--bm-muted)]">{r.description}</div>
          </li>
        ))}
      </ol>

      {q.hasNextPage ? (
        <div className="mt-8">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8]"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
