import { ManSectionLabel, RunningHead } from '../man/RunningHead'
import type { Concept, ConceptSource } from '../../lib/concepts'
import { DISTRO_LABEL, withDistro, type Distro } from '../../lib/distro'
import { tRich } from '../../lib/i18n/rich'
import type { ServerT } from '../../lib/i18n/server'
import { Kbd } from '../ui/Kbd'
import { Citation, ConceptText } from './ConceptText'

/**
 * The distro a source link opens: the reader's `?distro=` when the source was read
 * there, else Debian when it was, else the first distro that has it. A reader on
 * FreeBSD is never sent to a page FreeBSD does not ship.
 */
export function sourceDistro(source: Pick<ConceptSource, 'distros'>, urlDistro: Distro | null): Distro | null {
  if (urlDistro && source.distros.includes(urlDistro)) return urlDistro
  if (source.distros.includes('debian')) return null
  return (source.distros[0] as Distro | undefined) ?? null
}

function formatDate(iso: string, lang: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * A concept explainer (B8, #400): BetterMan's own plain-English text over the manual's
 * section 7 pages, rendered by pages/concept/[slug].tsx as plain HTML.
 */
export function ConceptArticle({
  concept,
  urlDistro,
  published,
  reportHref,
  t,
}: {
  concept: Concept
  urlDistro: Distro | null
  /** Slugs that render, so links to other explainers only appear once those are published. */
  published: string[]
  reportHref: string
  t: ServerT
}) {
  const primary = concept.sources.filter((s) => s.page.section.startsWith('7'))
  const lead = primary.length ? primary : concept.sources.slice(0, 1)

  return (
    <div className="mx-auto max-w-[46rem]" data-bm-concept={concept.slug}>
      <RunningHead title={t('Concept')} label={concept.title} end="BetterMan" />
      <header className="pt-9">
        {concept.status !== 'approved' ? (
          <p className="mb-4 text-sm text-accent" data-bm-concept-draft>
            Draft ({concept.status}): not published. It shows only because this build sets BETTERMAN_CONCEPT_DRAFTS=1.
          </p>
        ) : null}
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">{concept.title}</h1>
        <p className="mt-3 text-lg leading-[1.5] text-ink-2">{concept.summary}</p>
      </header>

      <section aria-labelledby="concept-manual" className="mt-8">
        <ManSectionLabel as="h2" id="concept-manual">
          {lead.length > 1 ? t('The manual’s pages') : t('The manual’s page')}
        </ManSectionLabel>
        <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 font-serif text-2xl">
          {lead.map((source) => (
            <li key={`${source.page.name}(${source.page.section})`}>
              <Citation name={source.page.name} section={source.page.section} urlDistro={sourceDistro(source, urlDistro)} className="no-underline hover:text-accent" />
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-sm text-ink-3">{t('The manual is the authority; this page is a plain-English way in.')}</p>
      </section>

      <article aria-label={t('Explainer')} className="mt-8 border-t border-rule pt-6">
        <p className="mb-5 text-sm text-ink-3" data-bm-concept-provenance>
          {t('BetterMan’s own explainer, not text from the manual. Generated · {by}, {date}; {review}', {
            by: concept.generatedBy,
            date: formatDate(concept.generatedOn, t.lang),
            review:
              concept.status === 'approved'
                ? t('checked against the pages it cites by a model panel and read by the maintainer.')
                : concept.panelReview
                  ? t('checked against the pages it cites by a model panel; not yet read by the maintainer.')
                  : t('not yet reviewed.'),
          })}
        </p>
        <ConceptText blocks={concept.body} urlDistro={urlDistro} published={new Set(published)} t={t} />
      </article>

      <section aria-labelledby="concept-sources" className="mt-12">
        <ManSectionLabel as="h2" id="concept-sources">
          {t('Sources')}
        </ManSectionLabel>
        <ul className="mt-2 border-b border-rule">
          {concept.sources.map((source) => (
            <li key={`${source.page.name}(${source.page.section})`} className="border-t border-rule py-2.5 text-sm text-ink-2">
              <span className="font-serif text-[1.0625rem] text-ink">
                <Citation name={source.page.name} section={source.page.section} urlDistro={sourceDistro(source, urlDistro)} />
              </span>
              {source.package ? <span className="ml-2 font-mono text-xs text-ink-3">{source.package}</span> : null}
              <span className="block">{source.distros.map((d) => DISTRO_LABEL[d as Distro] ?? d).join(' · ')}</span>
              <span className="block text-ink-3">{t('Read: {sections}', { sections: source.sections })}</span>
            </li>
          ))}
        </ul>
      </section>

      {concept.related.length ? (
        <section aria-labelledby="concept-related" className="mt-8">
          <ManSectionLabel as="h2" id="concept-related">
            {t('Related pages')}
          </ManSectionLabel>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-serif text-base">
            {concept.related.map((ref) => (
              <li key={`${ref.name}(${ref.section})`}>
                <Citation name={ref.name} section={ref.section} urlDistro={urlDistro} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-12 text-xs text-ink-3">
        {tRich(t, '{link} with this explainer on GitHub.', {
          link: (
            <a href={reportHref} target="_blank" rel="noopener noreferrer" className="underline">
              {t('Report a problem')}
            </a>
          ),
        })}
      </p>
    </div>
  )
}

/** An explainer that does not exist, or is not published: man's ENOENT, as on every other 404. */
export function ConceptNotFound({ urlDistro, t }: { urlDistro: Distro | null; t: ServerT }) {
  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title="ERRNO(3)" label={t('404 Not Found')} end="ENOENT" />
      <div className="pt-[12vh]">
        <h1 className="break-words font-mono text-[1.625rem] leading-snug">{t('No such file or directory')}</h1>
        <p className="mt-4 font-serif text-lg text-ink-2">
          {tRich(t, 'Nothing lives at this address. Press {key} to search the manual.', { key: <Kbd>⌘K</Kbd> })}
        </p>
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={withDistro('/', urlDistro)} className="underline">
            {t('Go home')}
          </a>
          <a href={withDistro('/search', urlDistro)} className="underline">
            {t('Search')}
          </a>
        </p>
      </div>
    </div>
  )
}
