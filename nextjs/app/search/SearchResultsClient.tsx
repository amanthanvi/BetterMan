'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { SearchResponse, SearchResult } from '../../lib/api'
import type { Distro } from '../../lib/distro'
import { withDistro } from '../../lib/distro'

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&')
}

function highlight(text: string, query: string): ReactNode[] {
  const q = query.trim()
  if (q.length < 2) return [text]

  const re = new RegExp(escapeRegExp(q), 'gi')
  const out: ReactNode[] = []
  let last = 0

  while (true) {
    const m = re.exec(text)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (start > last) out.push(text.slice(last, start))
    out.push(
      <mark key={start} className="bm-mark bm-find">
        {text.slice(start, end)}
      </mark>,
    )
    last = end
    if (!m[0].length) re.lastIndex += 1
  }

  if (last < text.length) out.push(text.slice(last))
  return out.length ? out : [text]
}

function buildManHref(opts: { distro: Distro; name: string; section: string }) {
  return withDistro(`/man/${encodeURIComponent(opts.name)}/${encodeURIComponent(opts.section)}`, opts.distro)
}

async function fetchMore(opts: { distro: Distro; q: string; section: string; limit: number; offset: number }): Promise<SearchResponse> {
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
  const lines = (r.highlights ?? []).map((s) => s.trim()).filter(Boolean)
  if (!lines.length) return ''
  return lines.slice(0, 2).join('\n')
}

function ResultCard({ distro, q, r }: { distro: Distro; q: string; r: SearchResult }) {
  const href = useMemo(() => buildManHref({ distro, name: r.name, section: r.section }), [distro, r.name, r.section])
  const synopsis = useMemo(() => buildSynopsisSnippet(r), [r])

  return (
    <li className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 transition-colors hover:border-[var(--bm-border-accent)]">
      <div className="flex flex-col gap-2">
        <Link
          href={href}
          className="font-mono text-sm font-semibold text-[color:var(--bm-fg)] hover:text-[var(--bm-accent-hover)]"
          aria-label={`${r.name}(${r.section})`}
          title={`${r.name}(${r.section})`}
        >
          {r.name}({r.section})
        </Link>

        <div className="text-[13px] text-[color:var(--bm-muted)]">{highlight(r.description, q)}</div>

        {synopsis ? (
          <pre className="overflow-x-auto rounded-[var(--bm-radius)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-3 font-mono text-xs leading-[1.6] text-[color:var(--bm-fg)]" tabIndex={0}>
            <code>{highlight(synopsis, q)}</code>
          </pre>
        ) : null}
      </div>
    </li>
  )
}

export function SearchResultsClient({
  distro,
  q,
  section,
  initial,
}: {
  distro: Distro
  q: string
  section: string
  initial: SearchResponse | null
}) {
  const [results, setResults] = useState<SearchResult[]>(() => initial?.results ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResults(initial?.results ?? [])
    setError(null)
    setLoading(false)
  }, [initial])

  const canLoadMore = Boolean(q && results.length > 0)

  const onLoadMore = useCallback(async () => {
    if (!q || loading) return
    setLoading(true)
    setError(null)
    try {
      const next = await fetchMore({ distro, q, section, limit: 20, offset: results.length })
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
      setError(e instanceof Error ? e.message : 'Failed to load more')
    } finally {
      setLoading(false)
    }
  }, [distro, loading, q, results.length, section])

  if (!q) {
    return (
      <div className="mt-8 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Try:{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('tar')}`, distro)}
          className="font-mono text-[var(--bm-accent)] hover:text-[var(--bm-accent-hover)]"
        >
          tar
        </Link>
        ,{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('ssh')}`, distro)}
          className="font-mono text-[var(--bm-accent)] hover:text-[var(--bm-accent-hover)]"
        >
          ssh
        </Link>
        ,{' '}
        <Link
          href={withDistro(`/search?q=${encodeURIComponent('curl')}`, distro)}
          className="font-mono text-[var(--bm-accent)] hover:text-[var(--bm-accent-hover)]"
        >
          curl
        </Link>
        .
      </div>
    )
  }

  if (!results.length) {
    return (
      <div className="mt-8 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        No results for <span className="font-mono text-[color:var(--bm-fg)]">{q}</span>.
        {initial?.suggestions?.length ? (
          <div className="mt-3">
            <span className="text-[color:var(--bm-muted)]">Did you mean:</span>{' '}
            {initial.suggestions.map((s, idx) => (
              <span key={s}>
                {idx ? ', ' : ''}
                <Link href={withDistro(`/search?q=${encodeURIComponent(s)}`, distro)} className="font-mono text-[var(--bm-accent)] hover:text-[var(--bm-accent-hover)]">
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
    <div className="mt-8">
      {initial?.suggestions?.length ? (
        <div className="mb-4 text-xs text-[color:var(--bm-muted)]">
          Did you mean:{' '}
          {initial.suggestions.map((s, idx) => (
            <span key={s}>
              {idx ? ', ' : ''}
              <Link href={withDistro(`/search?q=${encodeURIComponent(s)}`, distro)} className="font-mono text-[var(--bm-accent)] hover:text-[var(--bm-accent-hover)]">
                {s}
              </Link>
            </span>
          ))}
          ?
        </div>
      ) : null}

      <ol className="space-y-3" aria-label="Search results">
        {results.map((r) => (
          <ResultCard key={`${r.name}:${r.section}`} distro={distro} q={q} r={r} />
        ))}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--bm-muted)]">{results.length.toLocaleString()} results loaded</div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-2 text-sm font-medium text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-2)] disabled:opacity-50"
          onClick={onLoadMore}
          disabled={!canLoadMore || loading}
          aria-label="Load more results"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      </div>

      {error ? <div className="mt-3 text-xs text-[var(--bm-accent)]">{error}</div> : null}
    </div>
  )
}
