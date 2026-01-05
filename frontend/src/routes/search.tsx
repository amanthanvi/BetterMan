import { useInfiniteQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { search } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { SearchResult } from '../api/types'
import { useDebouncedValue } from '../lib/useDebouncedValue'
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
  const navigate = useNavigate()
  const [input, setInput] = useState(q)
  const debouncedInput = useDebouncedValue(input, 150)

  useEffect(() => {
    setInput(q)
  }, [q])

  useEffect(() => {
    const next = debouncedInput.trim()
    if (next === q) return
    navigate({ to: '/search', search: { q: next }, replace: true })
  }, [debouncedInput, navigate, q])

  const query = q.trim()
  const limit = 20

  const resultsQuery = useInfiniteQuery({
    queryKey: queryKeys.search(query),
    enabled: query.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      search({
        q: query,
        limit,
        offset: typeof pageParam === 'number' ? pageParam : 0,
      }),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.results.length < limit) return undefined
      const nextOffset = pages.reduce((sum, page) => sum + page.results.length, 0)
      return nextOffset >= 5000 ? undefined : nextOffset
    },
  })

  const allResults = useMemo(
    () => resultsQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [resultsQuery.data?.pages],
  )

  const suggestions = resultsQuery.data?.pages[0]?.suggestions ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
          <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
            Fast lookup across the current dataset.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command…"
          className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
          aria-label="Search man pages"
          autoFocus
        />
      </div>

      {query.length === 0 ? (
        <div className="mt-8 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          Try <span className="font-medium text-[var(--bm-fg)]">tar</span>,{' '}
          <span className="font-medium text-[var(--bm-fg)]">ssh</span>, or{' '}
          <span className="font-medium text-[var(--bm-fg)]">systemd.unit</span>.
        </div>
      ) : resultsQuery.isLoading ? (
        <div className="mt-8 text-sm text-[color:var(--bm-muted)]">Searching…</div>
      ) : resultsQuery.isError ? (
        <div className="mt-8 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          Search failed.{' '}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => resultsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : allResults.length === 0 ? (
        <div className="mt-8 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          No results.
          {suggestions.length ? (
            <>
              {' '}
              Try:{' '}
              {suggestions.map((s, idx) => (
                <span key={s}>
                  {idx ? ', ' : ''}
                  <Link to="/search" search={{ q: s }} className="underline underline-offset-4">
                    {s}
                  </Link>
                </span>
              ))}
              .
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-8">
          <ol className="space-y-3">
            {allResults.map((r) => (
              <SearchResultRow key={`${r.name}:${r.section}`} result={r} />
            ))}
          </ol>

          {resultsQuery.hasNextPage ? (
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8]"
                onClick={() => resultsQuery.fetchNextPage()}
                disabled={resultsQuery.isFetchingNextPage}
              >
                {resultsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function SearchResultRow({ result }: { result: SearchResult }) {
  return (
    <li className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/man/$name/$section"
            params={{ name: result.name, section: result.section }}
            className="font-semibold tracking-tight"
          >
            {result.name}({result.section})
          </Link>
          <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{result.description}</div>
          {result.highlights.length ? (
            <div className="mt-3 text-sm text-[color:var(--bm-muted)]">
              {result.highlights.slice(0, 2).map((h, idx) => (
                <p key={idx} className={idx ? 'mt-2' : ''}>
                  <HighlightText text={h} />
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function HighlightText({ text }: { text: string }) {
  const parts: Array<{ kind: 'text' | 'mark'; value: string }> = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf('⟪', cursor)
    if (start === -1) {
      parts.push({ kind: 'text', value: text.slice(cursor) })
      break
    }

    if (start > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    const end = text.indexOf('⟫', start + 1)
    if (end === -1) {
      parts.push({ kind: 'text', value: text.slice(start) })
      break
    }

    parts.push({ kind: 'mark', value: text.slice(start + 1, end) })
    cursor = end + 1
  }

  return (
    <>
      {parts.map((p, idx) =>
        p.kind === 'mark' ? (
          <mark
            key={idx}
            className="rounded bg-[color:var(--bm-accent)/0.18] px-1 py-0.5 text-[color:var(--bm-fg)]"
          >
            {p.value}
          </mark>
        ) : (
          <span key={idx}>{p.value}</span>
        ),
      )}
    </>
  )
}
