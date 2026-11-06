'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SearchResponse, SearchResult } from '../../lib/api'
import type { ConceptLink } from '../../lib/concepts'
import { withDistro, type Distro } from '../../lib/distro'
import { useDistro } from '../../components/state/distro'
import { useLang } from '../../components/state/lang'
import { tRich } from '../../lib/i18n/rich'
import { SearchResultsBody } from '../../components/search/SearchResultsBody'

export { resultKind } from '../../components/search/ResultRow'

/** Queries the empty search page suggests: a name, a name, a task. They are typed, so they stay as written. */
const EXAMPLE_QUERIES = ['tar', 'ssh', 'copy files'] as const

async function fetchMore(opts: {
  distro: Distro
  q: string
  section: string
  limit: number
  offset: number
  lang: string | null
}): Promise<SearchResponse> {
  const params = new URLSearchParams()
  params.set('q', opts.q)
  params.set('limit', String(opts.limit))
  params.set('offset', String(opts.offset))
  if (opts.section) params.set('section', opts.section)
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  if (opts.lang) params.set('lang', opts.lang)

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
  concepts = [],
  lang = null,
}: {
  /** The distro the results came from, after any Debian fallback. */
  distro: Distro
  q: string
  section: string
  initial: SearchResponse | null
  /** Explainers the query names, matched on the server. */
  concepts?: ConceptLink[]
  /** `?lang=` (#395): translated hits first; the server's nextOffset then pages English. */
  lang?: string | null
}) {
  const { urlDistro } = useDistro()
  const { t, tn, urlLang } = useLang()
  const [results, setResults] = useState<SearchResult[]>(() => initial?.results ?? [])
  const [hasMore, setHasMore] = useState<boolean>(() => initial?.hasMore ?? false)
  const [nextOffset, setNextOffset] = useState<number | null>(() => initial?.nextOffset ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Bumped whenever the query context resets so an in-flight load-more from a
     previous query can never append to the new result list. */
  const requestEpochRef = useRef(0)

  useEffect(() => {
    requestEpochRef.current += 1
    setResults(initial?.results ?? [])
    setHasMore(initial?.hasMore ?? false)
    setNextOffset(initial?.nextOffset ?? null)
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
      const next = await fetchMore({ distro, q, section, limit: 20, offset: nextOffset ?? results.length, lang })
      if (epoch !== requestEpochRef.current) return
      setHasMore(next.hasMore)
      setNextOffset(next.nextOffset ?? null)
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
      setError(e instanceof Error ? e.message : t('Failed to load more'))
    } finally {
      if (epoch === requestEpochRef.current) setLoading(false)
    }
  }, [distro, lang, loading, nextOffset, q, results.length, section, t])

  if (!q) {
    return (
      <p className="mt-10 text-sm text-ink-2">
        {tRich(t, 'Search by command name or by what it does. Try {examples}.', {
          examples: EXAMPLE_QUERIES.map((example, index) => (
            <span key={example}>
              {index ? ', ' : null}
              <Link href={withDistro(`/search?q=${encodeURIComponent(example)}`, urlDistro, urlLang)} className="font-mono underline">
                {example}
              </Link>
            </span>
          )),
        })}
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
      concepts={concepts}
      urlLang={urlLang}
      t={t}
      footer={
        <>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <div className="text-xs text-ink-3" aria-live="polite">
              {tn('{count, plural, one {# result loaded} other {# results loaded}}', results.length, `${results.length.toLocaleString()} results loaded`)}
            </div>
            <button
              type="button"
              className="text-sm text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent disabled:pointer-events-none disabled:text-ink-3 disabled:no-underline"
              onClick={onLoadMore}
              disabled={!canLoadMore || loading}
              aria-label={
                loading
                  ? t('Load more results, Loading')
                  : hasMore
                    ? t('Load more results')
                    : t('Load more results, All results loaded')
              }
            >
              {loading ? t('Loading…') : hasMore ? t('Load more') : t('All results loaded')}
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
