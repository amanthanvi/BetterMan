import Link from 'next/link'
import type { ReactNode } from 'react'

import type { SearchResult, TopHit } from '../../lib/api'
import { withDistro, type Distro } from '../../lib/distro'
import { looksLikeCommandLine } from '../../lib/explain'
import { ResultRow } from './ResultRow'

function DidYouMean({ suggestions, urlDistro }: { suggestions: string[]; urlDistro: Distro | null }) {
  return (
    <>
      Did you mean:{' '}
      {suggestions.map((s, idx) => (
        <span key={s}>
          {idx ? ', ' : ''}
          <Link href={withDistro(`/search?q=${encodeURIComponent(s)}`, urlDistro)} className="font-mono underline">
            {s}
          </Link>
        </span>
      ))}
      ?
    </>
  )
}

/** A pasted command line gets a way to its explanation before any results. */
function ExplainOffer({ q, urlDistro }: { q: string; urlDistro: Distro | null }) {
  if (!looksLikeCommandLine(q)) return null
  return (
    <p className="mb-4 text-sm text-ink-2">
      Explain{' '}
      <a href={withDistro(`/explain?cmd=${encodeURIComponent(q)}`, urlDistro)} className="font-mono text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
        {q}
      </a>{' '}
      token by token
    </p>
  )
}

/**
 * Results without state: the search page wraps it with Load more, and home
 * renders it on the server under its search box. The top hit leads the first row.
 */
export function SearchResultsBody({
  q,
  section,
  results,
  suggestions,
  top,
  urlDistro,
  footer,
}: {
  q: string
  section: string
  results: SearchResult[]
  suggestions: string[]
  top?: TopHit | null
  urlDistro: Distro | null
  footer?: ReactNode
}) {
  if (!results.length) {
    return (
      <div className="mt-10 text-sm text-ink-2">
        <ExplainOffer q={q} urlDistro={urlDistro} />
        <p className="font-serif text-lg text-ink">
          No results for <q className="font-mono text-base">{q}</q>.
        </p>
        {q.trim().includes(' ') ? (
          <span> Search command names, flags, words from a page’s description, or a task in plain words, such as “extract a tarball”.</span>
        ) : null}
        {q.includes('.') || q.includes('_') ? null : (
          <span> Names with dots or underscores are searched as written, like <span className="font-mono">ssh_config</span>.</span>
        )}
        {suggestions.length ? (
          <div className="mt-3">
            <DidYouMean suggestions={suggestions} urlDistro={urlDistro} />
          </div>
        ) : null}
      </div>
    )
  }

  const first = results[0]
  const leads = top && top.name === first.name && top.section === first.section ? top : null
  return (
    <div className="mt-10">
      <ExplainOffer q={q} urlDistro={urlDistro} />
      {suggestions.length ? (
        <div className="mb-4 text-sm text-ink-2">
          <DidYouMean suggestions={suggestions} urlDistro={urlDistro} />
        </div>
      ) : null}
      <h2 className="mb-3 font-serif text-xl">
        Results for <q>{q}</q>
        {section ? <span className="ml-2 font-sans text-sm text-ink-3">section {section}</span> : null}
        {first.match === 'task' ? <span className="ml-2 font-sans text-sm text-ink-3">read as a task</span> : null}
      </h2>
      <ol aria-label="Search results" className="border-b border-rule">
        {results.map((r, index) => (
          <ResultRow key={`${r.name}:${r.section}`} r={r} q={q} urlDistro={urlDistro} top={index === 0 ? leads : null} />
        ))}
      </ol>
      {footer}
    </div>
  )
}
