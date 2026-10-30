'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SearchResponse, SearchResult } from '../../lib/api'
import { withDistro, type Distro } from '../../lib/distro'
import { useDistro } from '../../components/state/distro'
import { SearchResultsBody } from '../../components/search/SearchResultsBody'

export { resultKind } from '../../components/search/ResultRow'

async function fetchMore(opts: {
  distro: Distro
  q: string
  section: string
  limit: number
  offset: number
}): Promise<SearchResponse> {
  const params = new URLSearchParams()
  params.set('q', opts.q)
  params.set('limit', String(opts.limit))
  params.set('offset', String(opts.offset))
  if (opts.section) params.set('section', opts.section)
  if (opts.distro !== 'debian') params.set('distro', opts.distro)

  const res = await fetch(`/api/v1/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as SearchResponse
}

function getSuggestions(initial: SearchResponse | null, q: string): string[] {
  if (initial?.results.length && !initial.correctedQuery) return []
  const wanted = (initial?.suggestions ?? []).map((s) => s.trim()).filter(Boolean)
  if (!wanted.length) return []

  const qLower = q.trim().toLowerCase()
  const out: string[] = []
  const seen = new Set<string>()

  for (const s of wanted) {
    const k = s.toLowerCase()
    if (k === qLower) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }

  return out
}

export function SearchResultsClient({
  distro,
  q,
  section,
  initial,
}: {
  /** The distro the results came from, after any Debian fallback. */
  distro: Distro
  q: string
  section: string
  initial: SearchResponse | null
}) {
  const { urlDistro } = useDistro()
  const [results, setResults] = useState<SearchResult[]>(() => initial?.results ?? [])
  const [hasMore, setHasMore] = useState<boolean>(() => initial?.hasMore ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Bumped whenever the query context resets so an in-flight load-more from a
     previous query can never append to the new result list. */
  const requestEpochRef = useRef(0)

  useEffect(() => {
    requestEpochRef.current += 1
    setResults(initial?.results ?? [])
    setHasMore(initial?.hasMore ?? false)
    setError(null)
    setLoading(false)
  }, [distro, initial, q, section])

  const canLoadMore = Boolean(q && results.length > 0 && hasMore)

  const onLoadMore = useCallback(async () => {
    if (!q || loading) return
    const epoch = requestEpochRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await fetchMore({ distro, q, section, limit: 20, offset: results.length })
      if (epoch !== requestEpochRef.current) return
      setHasMore(next.hasMore)
      setResults((prev) => {
        const seen = new Set(prev.map((r) => `${r.name}:${r.section}`))
        const merged = prev.slice()
        for (const r of next.results) {
          const key = `${r.name}:${r.section}`
          if (seen.has(key)) continue
          merged.push(r)
          seen.add(key)
        }
        return merged
      })
    } catch (e) {
      if (epoch !== requestEpochRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load more')
    } finally {
      if (epoch === requestEpochRef.current) setLoading(false)
    }
  }, [distro, loading, q, results.length, section])

  if (!q) {
    return (
      <p className="mt-10 text-sm text-ink-2">
        Search by command name or by what it does. Try{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('tar')}`, urlDistro)}
          className="font-mono underline"
        >
          tar
        </Link>
        ,{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('ssh')}`, urlDistro)}
          className="font-mono underline"
        >
          ssh
        </Link>
        ,{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('copy files')}`, urlDistro)}
          className="font-mono underline"
        >
          copy files
        </Link>
        .
      </p>
    )
  }

  const suggestions = getSuggestions(initial, q)

  return (
    <SearchResultsBody
      q={q}
      section={section}
      results={results}
      suggestions={suggestions}
      top={initial?.top ?? null}
      urlDistro={urlDistro}
      footer={
        <>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <div className="text-xs text-ink-3" aria-live="polite">
              {results.length.toLocaleString()} results loaded
            </div>
            <button
              type="button"
              className="text-sm text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent disabled:pointer-events-none disabled:text-ink-3 disabled:no-underline"
              onClick={onLoadMore}
              disabled={!canLoadMore || loading}
              aria-label={
                loading
                  ? 'Load more results, Loading'
                  : hasMore
                    ? 'Load more results'
                    : 'Load more results, All results loaded'
              }
            >
              {loading ? 'Loading…' : hasMore ? 'Load more' : 'All results loaded'}
            </button>
          </div>

          {error ? (
            <div role="alert" className="mt-3 text-xs text-accent">
              {error}
            </div>
          ) : null}
        </>
      }
    />
  )
}
