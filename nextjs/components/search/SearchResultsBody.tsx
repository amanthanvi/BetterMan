import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

import type { SearchResult, TopHit } from '../../lib/api'
import type { ConceptLink, ConceptMatch } from '../../lib/concepts'
import { withDistro, type Distro } from '../../lib/distro'
import { looksLikeCommandLine } from '../../lib/explain'
import { ConceptRow } from './ConceptRow'
import type { Lang } from '../../lib/i18n/locales'
import { tRich } from '../../lib/i18n/rich'
import type { ClientT } from '../../lib/i18n/server'
import { ResultRow } from './ResultRow'

function DidYouMean({ suggestions, urlDistro, urlLang, t }: { suggestions: string[]; urlDistro: Distro | null; urlLang: Lang | null; t: ClientT }) {
  const list = suggestions.map((s, idx) => (
    <span key={s}>
      {idx ? ', ' : ''}
      <Link href={withDistro(`/search?q=${encodeURIComponent(s)}`, urlDistro, urlLang)} className="font-mono underline">
        {s}
      </Link>
    </span>
  ))
  return <>{tRich(t, 'Did you mean: {list}?', { list })}</>
}

/** A pasted command line gets a way to its explanation before any results. */
function ExplainOffer({ q, urlDistro, urlLang, t }: { q: string; urlDistro: Distro | null; urlLang: Lang | null; t: ClientT }) {
  if (!looksLikeCommandLine(q)) return null
  const command = (
    <a href={withDistro(`/explain?cmd=${encodeURIComponent(q)}`, urlDistro, urlLang)} className="font-mono text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
      {q}
    </a>
  )
  return <p className="mb-4 text-sm text-ink-2">{tRich(t, 'Explain {command} token by token', { command })}</p>
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
  concepts = [],
  urlLang,
  t,
  footer,
}: {
  q: string
  section: string
  results: SearchResult[]
  suggestions: string[]
  top?: TopHit | null
  urlDistro: Distro | null
  /** BetterMan explainers the query names (lib/concepts.ts matchConcepts). */
  concepts?: (ConceptLink & Partial<Pick<ConceptMatch, 'via'>>)[]
  urlLang: Lang | null
  t: ClientT
  footer?: ReactNode
}) {
  // Explainers explain the manual's section 7 pages, so another section filter leaves them out.
  // An alias-only match yields when the first hit is a command of exactly that name that
  // the explainer is not about: `nice` finds nice(1), not the scheduling explainer.
  const first = results[0]
  const asked = q.trim().toLowerCase()
  const conceptRows = section && !section.startsWith('7')
    ? []
    : concepts.filter((concept) =>
      concept.via !== 'alias' || !first || first.name.toLowerCase() !== asked || concept.sources.some((s) => s.name === first.name))
  if (!results.length && conceptRows.length) {
    return (
      <div className="mt-10">
        <h2 className="mb-3 font-serif text-xl">
          Results for <q>{q}</q>
        </h2>
        <ol aria-label="Search results" className="border-b border-rule">
          {conceptRows.map((concept) => (
            <ConceptRow key={concept.slug} concept={concept} urlDistro={urlDistro} />
          ))}
        </ol>
      </div>
    )
  }
  if (!results.length) {
    return (
      <div className="mt-10 text-sm text-ink-2">
        <ExplainOffer q={q} urlDistro={urlDistro} urlLang={urlLang} t={t} />
        <p className="font-serif text-lg text-ink">{tRich(t, 'No results for {query}.', { query: <q className="font-mono text-base">{q}</q> })}</p>
        {q.trim().includes(' ') ? <span> {t('Search command names, flags, words from a page’s description, or a task in plain words, such as “extract a tarball”.')}</span> : null}
        {q.includes('.') || q.includes('_') ? null : (
          <span> {tRich(t, 'Names with dots or underscores are searched as written, like {example}.', { example: <span className="font-mono">ssh_config</span> })}</span>
        )}
        {suggestions.length ? (
          <div className="mt-3">
            <DidYouMean suggestions={suggestions} urlDistro={urlDistro} urlLang={urlLang} t={t} />
          </div>
        ) : null}
      </div>
    )
  }

  const leads = top && top.name === first.name && top.section === first.section ? top : null
  return (
    <div className="mt-10">
      <ExplainOffer q={q} urlDistro={urlDistro} urlLang={urlLang} t={t} />
      {suggestions.length ? (
        <div className="mb-4 text-sm text-ink-2">
          <DidYouMean suggestions={suggestions} urlDistro={urlDistro} urlLang={urlLang} t={t} />
        </div>
      ) : null}
      <h2 className="mb-3 font-serif text-xl">
        {tRich(t, 'Results for {query}', { query: <q>{q}</q> })}
        {section ? <span className="ml-2 font-sans text-sm text-ink-3">{t('section {section}', { section })}</span> : null}
        {first.match === 'task' ? <span className="ml-2 font-sans text-sm text-ink-3">{t('read as a task')}</span> : null}
      </h2>
      <ol aria-label={t('Search results')} className="border-b border-rule">
        {results.map((r, index) => (
          <Fragment key={`${r.name}:${r.section}`}>
            <ResultRow r={r} q={q} urlDistro={urlDistro} urlLang={urlLang} t={t} top={index === 0 ? leads : null} />
            {/* An explainer follows the first hit, so the top hit still leads. */}
            {index === 0 ? conceptRows.map((concept) => <ConceptRow key={concept.slug} concept={concept} urlDistro={urlDistro} t={t} />) : null}
          </Fragment>
        ))}
      </ol>
      {footer}
    </div>
  )
}
