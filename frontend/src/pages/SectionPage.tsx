import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'

import { useDistro } from '../app/distro'
import { listSection, search } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { SectionPage as SectionPageItem } from '../api/types'
import { getCanonicalUrl } from '../lib/seo'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { sectionRoute } from '../routes/section.$section'

export default function SectionPage() {
  const { section } = sectionRoute.useParams()
  const distro = useDistro()
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q, 150).trim()

  const limit = 200

  const browseQuery = useInfiniteQuery({
    queryKey: queryKeys.section(distro.distro, section),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listSection(section, { limit, offset: typeof pageParam === 'number' ? pageParam : 0 }),
    getNextPageParam: (lastPage, pages) => {
      const nextOffset = pages.reduce((sum, page) => sum + page.results.length, 0)
      if (nextOffset >= lastPage.total) return undefined
      return nextOffset >= 5000 ? undefined : nextOffset
    },
  })

  const searchLimit = 50
  const searchQuery = useInfiniteQuery({
    queryKey: queryKeys.search(distro.distro, debounced, section),
    enabled: debounced.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      search({
        q: debounced,
        section,
        limit: searchLimit,
        offset: typeof pageParam === 'number' ? pageParam : 0,
      }),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.results.length < searchLimit) return undefined
      const nextOffset = pages.reduce((sum, page) => sum + page.results.length, 0)
      return nextOffset >= 5000 ? undefined : nextOffset
    },
  })

  if (browseQuery.isLoading) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (browseQuery.isError) {
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Section not found.
      </div>
    )
  }

  if (!browseQuery.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const first = browseQuery.data.pages[0]
  const results = browseQuery.data.pages.flatMap((p) => p.results)

  const grouped = groupByLetter(results)
  const canonical = getCanonicalUrl()
  const title = `Section ${first.section} — ${first.label} — BetterMan`
  const description = `Browse BetterMan man pages in section ${first.section} (${first.label}).`

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
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Section <span className="font-mono">{first.section}</span>{' '}
          <span className="text-[color:var(--bm-muted)]">— {first.label}</span>
        </h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">{first.total.toLocaleString()} pages</p>
      </header>

      <div className="mt-6 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search within section…"
          className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
          aria-label="Search within section"
        />
      </div>

      {debounced.length > 0 ? (
        <div className="mt-8">
          {searchQuery.isLoading ? (
            <div className="text-sm text-[color:var(--bm-muted)]">Searching…</div>
          ) : searchQuery.isError ? (
            <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
              Search failed.
            </div>
          ) : (
            <>
              {searchQuery.data?.pages.flatMap((p) => p.results).length ? (
                <ol className="space-y-2">
                  {searchQuery.data?.pages.flatMap((p) => p.results).map((r) => (
                    <li
                      key={`${r.name}:${r.section}`}
                      className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm"
                    >
                      <Link
                        to="/man/$name/$section"
                        params={{ name: r.name, section: r.section }}
                        className="font-mono text-base font-semibold tracking-tight"
                      >
                        {r.name}({r.section})
                      </Link>
                      <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{r.description}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
                  No results.
                </div>
              )}

              {searchQuery.hasNextPage ? (
                <div className="mt-6">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
                    onClick={() => searchQuery.fetchNextPage()}
                    disabled={searchQuery.isFetchingNextPage}
                  >
                    {searchQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {grouped.map(([letter, items]) => (
            <section key={letter} aria-label={`Letter ${letter}`}>
              <div className="sticky top-16 z-10 -mx-4 border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] px-4 py-2 font-mono text-xs tracking-wide text-[color:var(--bm-muted)] backdrop-blur">
                {letter}
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((r) => (
                  <li
                    key={`${r.name}:${r.section}`}
                    className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm"
                  >
                    <Link
                      to="/man/$name/$section"
                      params={{ name: r.name, section: r.section }}
                      className="font-mono text-base font-semibold tracking-tight"
                    >
                      {r.name}({r.section})
                    </Link>
                    <div className="mt-1 text-xs text-[color:var(--bm-muted)]">{r.description}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {browseQuery.hasNextPage ? (
            <div className="mt-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
                onClick={() => browseQuery.fetchNextPage()}
                disabled={browseQuery.isFetchingNextPage}
              >
                {browseQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}

    </div>
  )
}

function groupByLetter(items: SectionPageItem[]) {
  const groups = new Map<string, SectionPageItem[]>()
  for (const item of items) {
    const first = (item.name[0] ?? '').toUpperCase()
    const letter = first >= 'A' && first <= 'Z' ? first : '#'
    const list = groups.get(letter) ?? []
    list.push(item)
    groups.set(letter, list)
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
}
