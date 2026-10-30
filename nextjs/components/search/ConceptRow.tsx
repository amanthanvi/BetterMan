import type { ConceptLink } from '../../lib/concepts'
import { withDistro, type Distro } from '../../lib/distro'

/**
 * A BetterMan explainer in the results, under the same small-caps kind label as the
 * manual's own section 7 pages (fix 15). The evidence line says whose text it is and
 * which manual page it explains. Only the matched rows reach the client, never the corpus.
 */
export function ConceptRow({ concept, urlDistro }: { concept: ConceptLink; urlDistro: Distro | null }) {
  return (
    <li className="grid gap-x-4 gap-y-0.5 border-t border-rule py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]" data-bm-concept-result={concept.slug}>
      <span className="small-caps text-[0.9375rem] leading-[1.6] text-ink-3">concept</span>
      <div className="min-w-0">
        <p className="font-serif text-[1.125rem] leading-[1.45]">
          <a href={withDistro(`/concept/${encodeURIComponent(concept.slug)}`, urlDistro)} className="no-underline hover:text-accent">
            <b className="font-semibold">{concept.title}</b>
          </a>{' '}
          <span className="font-sans text-base text-ink-2">{concept.summary}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-2">
          BetterMan explainer
          {concept.sources.length ? (
            <span className="text-ink-3">
              {' · on '}
              {concept.sources.map((s) => `${s.name}(${s.section})`).join(', ')}
            </span>
          ) : null}
        </p>
      </div>
    </li>
  )
}
