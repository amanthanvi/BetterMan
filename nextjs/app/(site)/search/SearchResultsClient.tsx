'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { SearchResponse, SearchResult } from '../../../lib/api'
import { manPageHref, withDistro, type Distro } from '../../../lib/distro'
import { useDistro } from '../../../components/state/distro'
import { escapeRegExp } from '../../../lib/textRanges'
import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'

const BACKEND_HIGHLIGHT_MARKER_RE = /[\u27ea\u27eb]/g

function stripBackendHighlightMarkers(text: string): string {
  return text.replace(BACKEND_HIGHLIGHT_MARKER_RE, '')
}

function highlight(text: string, query: string): ReactNode[] {
  const q = query.trim()
  const cleanedText = stripBackendHighlightMarkers(text)
  if (q.length < 2) return [cleanedText]

  const re = new RegExp(escapeRegExp(q), 'gi')
  const out: ReactNode[] = []
  let last = 0

  while (true) {
    const m = re.exec(cleanedText)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (start > last) out.push(cleanedText.slice(last, start))
    out.push(
      <mark key={start} className="bm-mark bm-find">
        {cleanedText.slice(start, end)}
      </mark>,
    )
    last = end
    if (!m[0].length) re.lastIndex += 1
  }

  if (last < cleanedText.length) out.push(cleanedText.slice(last))
  return out.length ? out : [cleanedText]
}

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

function buildSynopsisSnippet(r: SearchResult): string {
  const lines = (r.highlights ?? [])
    .flatMap((s) => stripBackendHighlightMarkers(s).split(/\r?\n/g))
    .map((s) => s.trim())
    .filter(Boolean)

  if (!lines.length) return ''

  const picked = r.match === 'option' ? lines.slice(0, 8) : lines.slice(-2)
  const maxLen = 180
  return picked
    .map((l) => (l.length > maxLen ? `${l.slice(0, maxLen)}…` : l))
    .join('\n')
}

/** Small-caps kind label: a flag match, or what the page's section documents. */
export function resultKind(r: SearchResult): string {
  if(r.symbolKind) return ({config:'directive',environment:'environment',files:'file',errors:'errno',subcommand:'subcommand',shell:'shell'} as const)[r.symbolKind]
  if (r.match === 'option') return 'flag'
  switch (r.section.charAt(0)) {
    case '1':
    case '6':
    case '8':
      return 'command'
    case '2':
      return 'system call'
    case '3':
      return 'function'
    case '4':
      return 'device'
    case '5':
      return 'file format'
    case '7':
      return 'concept'
    case '9':
      return 'kernel'
    default:
      return 'page'
  }
}

function ResultCard({ urlDistro, q, r }: { urlDistro: Distro | null; q: string; r: SearchResult }) {
  const anchorId = r.anchorId
  const href = useMemo(() => manPageHref(r.name, r.section, urlDistro, anchorId), [anchorId, urlDistro, r.name, r.section])
  const synopsis = useMemo(() => buildSynopsisSnippet(r), [r])

  return (
    <li className="grid gap-x-4 gap-y-0.5 border-t border-rule py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <span className="small-caps text-[0.9375rem] leading-[1.6] text-ink-3">{resultKind(r)}</span>
      <div className="min-w-0">
        <p className="font-serif text-[1.125rem] leading-[1.45]">
          <Link
            href={href}
            className="no-underline hover:text-accent"
            aria-label={`${r.name}(${r.section})`}
            title={`${r.name}(${r.section})`}
          >
            <b className="font-semibold">{r.name}</b>({r.section})
            <LinkPendingHint />
          </Link>{' '}
          <span className="text-ink-2">{highlight(r.description, q)}</span>
        </p>

        {synopsis ? (
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs leading-[1.6] text-ink-2">
            <code>{highlight(synopsis, q)}</code>
          </pre>
        ) : null}
      </div>
    </li>
  )
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

  if (!results.length) {
    return (
      <div className="mt-10 text-sm text-ink-2">
        <p className="font-serif text-lg text-ink">
          No results for <q className="font-mono text-base">{q}</q>.
        </p>
        {q.trim().includes(' ') ? (
          <span> Search command names, flags, or words from a page’s description. Full shell commands and natural-language questions are not supported yet.</span>
        ) : null}
        {q.includes('.') || q.includes('_') ? null : (
          <span> Names with dots or underscores are searched as written, like <span className="font-mono">ssh_config</span>.</span>
        )}
        {suggestions.length ? (
          <div className="mt-3">
            <span>Did you mean:</span>{' '}
            {suggestions.map((s, idx) => (
              <span key={s}>
                {idx ? ', ' : ''}
                <Link
                  href={withDistro(`/search?q=${encodeURIComponent(s)}`, urlDistro)}
                  className="font-mono underline"
                >
                  {s}
                </Link>
              </span>
            ))}
            ?
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-10">
      {suggestions.length ? (
        <div className="mb-4 text-sm text-ink-2">
          Did you mean:{' '}
          {suggestions.map((s, idx) => (
            <span key={s}>
              {idx ? ', ' : ''}
              <Link
                href={withDistro(`/search?q=${encodeURIComponent(s)}`, urlDistro)}
                className="font-mono underline"
              >
                {s}
              </Link>
            </span>
          ))}
          ?
        </div>
      ) : null}

      <h2 className="mb-3 font-serif text-xl">
        Results for <q>{q}</q>
        {section ? <span className="ml-2 font-sans text-sm text-ink-3">section {section}</span> : null}
      </h2>
      <ol aria-label="Search results" className="border-b border-rule">
        {results.map((r) => (
          <ResultCard key={`${r.name}:${r.section}`} urlDistro={urlDistro} q={q} r={r} />
        ))}
      </ol>

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
    </div>
  )
}
