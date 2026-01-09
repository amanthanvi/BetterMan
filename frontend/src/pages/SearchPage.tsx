import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'

import { listSections, search } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { SearchResult } from '../api/types'
import { getCanonicalUrl } from '../lib/seo'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { recordRecentSearch } from '../lib/recent'
import { searchRoute } from '../routes/search'

export default function SearchPage() {
  const { q, section } = searchRoute.useSearch()
  const navigate = useNavigate()
  const [input, setInput] = useState(q)
  const debouncedInput = useDebouncedValue(input, 150)
  const canonical = getCanonicalUrl()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const sectionsQuery = useQuery({
    queryKey: ['sections'],
    queryFn: () => listSections(),
  })

  useEffect(() => {
    setInput(q)
  }, [q])

  useEffect(() => {
    const next = debouncedInput.trim()
    if (next === q) return
    navigate({ to: '/search', search: { q: next, ...(section ? { section } : {}) }, replace: true })
  }, [debouncedInput, navigate, q, section])

  const query = q.trim()
  const limit = 20
  const sectionFilter = section?.trim() || undefined
  const title = query.length ? `Search “${query}” — BetterMan` : 'Search — BetterMan'
  const description = query.length
    ? `Search results for “${query}” in the BetterMan man page dataset${sectionFilter ? ` (section ${sectionFilter})` : ''}.`
    : 'Search the BetterMan man page dataset.'

  const resultsQuery = useInfiniteQuery({
    queryKey: queryKeys.search(query, sectionFilter),
    enabled: query.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      search({
        q: query,
        section: sectionFilter,
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
    <div className="mx-auto max-w-5xl">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {canonical ? <link rel="canonical" href={canonical} /> : null}
      </Helmet>
      <header className="flex flex-col gap-2 border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--bm-muted)]">
          <div>Fast lookup across the current dataset.</div>
          {query.length ? (
            <div className="font-mono text-xs">
              {sectionFilter ? `section ${sectionFilter} · ` : ''}
              {allResults.length.toLocaleString()} results loaded
              {resultsQuery.hasNextPage ? '+' : ''}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-6 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                if (!allResults.length) return
                e.preventDefault()
                setActiveIndex(0)
                itemRefs.current[0]?.focus()
              } else if (e.key === 'ArrowUp') {
                if (!allResults.length) return
                e.preventDefault()
                const idx = allResults.length - 1
                setActiveIndex(idx)
                itemRefs.current[idx]?.focus()
              }
            }}
            placeholder="Type a command…"
            className="min-w-[16rem] flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search man pages"
            autoFocus
          />
          <select
            value={section ?? ''}
            onChange={(e) => {
              const next = e.target.value
              navigate({
                to: '/search',
                search: { q: input.trim(), ...(next ? { section: next } : {}) },
                replace: true,
              })
            }}
            className="h-[3rem] rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter by section"
          >
            <option value="">All sections</option>
            {sectionsQuery.data?.map((s) => (
              <option key={s.section} value={s.section}>
                {s.section}: {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">Keys:</span>
          <span className="font-mono">↑/↓</span> navigate
          <span className="font-mono">j/k</span> navigate
          <span className="font-mono">Esc</span> back to input
        </div>
      </div>

      {query.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
          Try <span className="font-medium text-[var(--bm-fg)]">tar</span>,{' '}
          <span className="font-medium text-[var(--bm-fg)]">ssh</span>, or{' '}
          <span className="font-medium text-[var(--bm-fg)]">systemd.unit</span>.
        </div>
      ) : resultsQuery.isLoading ? (
        <div className="mt-8" aria-label="Loading search results">
          <ol className="space-y-3">
            {Array.from({ length: 8 }).map((_v, idx) => (
              <SearchResultSkeletonRow key={idx} />
            ))}
          </ol>
        </div>
      ) : resultsQuery.isError ? (
        <div className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
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
        <div className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
          No results.
          {suggestions.length ? (
            <>
              {' '}
              Try:{' '}
              {suggestions.map((s, idx) => (
                <span key={s}>
                  {idx ? ', ' : ''}
                  <Link
                    to="/search"
                    search={{ q: s, ...(section ? { section } : {}) }}
                    className="underline underline-offset-4"
                  >
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
            {allResults.map((r, idx) => (
              <SearchResultRow
                key={`${r.name}:${r.section}`}
                result={r}
                query={query}
                active={idx === activeIndex}
                bindRef={(el) => {
                  itemRefs.current[idx] = el
                }}
                onFocus={() => setActiveIndex(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    inputRef.current?.focus()
                    return
                  }

                  const isNext = e.key === 'ArrowDown' || e.key === 'j'
                  const isPrev = e.key === 'ArrowUp' || e.key === 'k'
                  if (!isNext && !isPrev) return

                  e.preventDefault()
                  const delta = isNext ? 1 : -1
                  const next = (idx + delta + allResults.length) % allResults.length
                  setActiveIndex(next)
                  itemRefs.current[next]?.focus()
                }}
              />
            ))}
          </ol>

          {resultsQuery.hasNextPage ? (
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
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

function SearchResultRow({
  result,
  query,
  active,
  bindRef,
  onFocus,
  onKeyDown,
}: {
  result: SearchResult
  query: string
  active: boolean
  bindRef: (el: HTMLAnchorElement | null) => void
  onFocus: () => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLAnchorElement>) => void
}) {
  return (
    <li
      className={`rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm ${
        active ? 'ring-2 ring-[color:var(--bm-accent)/0.35]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            ref={bindRef}
            to="/man/$name/$section"
            params={{ name: result.name, section: result.section }}
            className="font-mono text-base font-semibold tracking-tight"
            onClick={() => recordRecentSearch(query)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
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

function SearchResultSkeletonRow() {
  return (
    <li className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-40 rounded-full bg-[color:var(--bm-border)/0.65]" />
        <div className="h-4 w-[min(34rem,90%)] rounded-full bg-[color:var(--bm-border)/0.5]" />
        <div className="h-4 w-[min(26rem,80%)] rounded-full bg-[color:var(--bm-border)/0.4]" />
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
          <mark key={idx} className="bm-mark bm-opt">
            {p.value}
          </mark>
        ) : (
          <span key={idx}>{p.value}</span>
        ),
      )}
    </>
  )
}
