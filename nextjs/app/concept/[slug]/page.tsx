import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { Citation, ConceptText } from '../../../components/concept/ConceptText'
import { ManSectionLabel, RunningHead } from '../../../components/man/RunningHead'
import { conceptHref, conceptReportHref, getConcept, publishedConcepts, type ConceptSource } from '../../../lib/concepts'
import { DISTRO_LABEL, type Distro } from '../../../lib/distro'
import { getPublicOrigin } from '../../../lib/public-origin'
import { explicitDistro, type SearchParams } from '../../../lib/requestContext'

type ConceptPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params }: ConceptPageProps): Promise<Metadata> {
  const { slug } = await params
  const concept = getConcept(slug)
  if (!concept) return { title: 'No such file or directory — BetterMan', robots: { index: false, follow: false } }
  const origin = getPublicOrigin({ headers: await headers() })
  const title = `${concept.title} — BetterMan`
  return {
    title,
    description: concept.summary,
    alternates: { canonical: `${origin}${conceptHref(concept.slug)}` },
    openGraph: { title, description: concept.summary, type: 'article' },
    // A draft shows only on a build that opted in; it is never indexed.
    ...(concept.status === 'approved' ? {} : { robots: { index: false, follow: false } }),
  }
}

/** A source names the distros it was read from; link one that has it when Debian does not. */
function sourceDistro(source: ConceptSource, urlDistro: Distro | null): Distro | null {
  if (urlDistro || source.distros.includes('debian')) return urlDistro
  return (source.distros[0] as Distro | undefined) ?? null
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * A concept explainer (B8, #400): BetterMan's own plain-English text over the manual's
 * section 7 pages. Server-rendered and complete without JavaScript; it reads no data
 * beyond the explainers bundled at build time.
 */
export default async function ConceptPage({ params, searchParams }: ConceptPageProps) {
  const { slug } = await params
  const concept = getConcept(slug)
  if (!concept) notFound()
  const urlDistro = explicitDistro(await searchParams)
  const origin = getPublicOrigin({ headers: await headers() })
  const published = new Set(publishedConcepts().map((c) => c.slug))
  const primary = concept.sources.filter((s) => s.page.section.startsWith('7'))
  const lead = primary.length ? primary : concept.sources.slice(0, 1)

  return (
    <div className="mx-auto max-w-[46rem]" data-bm-concept={concept.slug}>
      <RunningHead title="Concept" label={concept.title} end="BetterMan" />
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
          {lead.length > 1 ? 'The manual’s pages' : 'The manual’s page'}
        </ManSectionLabel>
        <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 font-serif text-2xl">
          {lead.map((source) => (
            <li key={`${source.page.name}(${source.page.section})`}>
              <Citation name={source.page.name} section={source.page.section} urlDistro={sourceDistro(source, urlDistro)} className="no-underline hover:text-accent" />
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-sm text-ink-3">The manual is the authority; this page is a plain-English way in.</p>
      </section>

      <article aria-label="Explainer" className="mt-8 border-t border-rule pt-6">
        <p className="mb-5 text-sm text-ink-3" data-bm-concept-provenance>
          BetterMan’s own explainer, not text from the manual. Generated · {concept.generatedBy}, {formatDate(concept.generatedOn)};{' '}
          {concept.status === 'approved' ? 'checked against the pages it cites by a model panel and read by the maintainer.' : 'not yet reviewed.'}
        </p>
        <ConceptText blocks={concept.body} urlDistro={urlDistro} published={published} />
      </article>

      <section aria-labelledby="concept-sources" className="mt-12">
        <ManSectionLabel as="h2" id="concept-sources">
          Sources
        </ManSectionLabel>
        <ul className="mt-2 border-b border-rule">
          {concept.sources.map((source) => (
            <li key={`${source.page.name}(${source.page.section})`} className="border-t border-rule py-2.5 text-sm text-ink-2">
              <span className="font-serif text-[1.0625rem] text-ink">
                <Citation name={source.page.name} section={source.page.section} urlDistro={sourceDistro(source, urlDistro)} />
              </span>
              {source.package ? <span className="ml-2 font-mono text-xs text-ink-3">{source.package}</span> : null}
              <span className="block">{source.distros.map((d) => DISTRO_LABEL[d as Distro] ?? d).join(' · ')}</span>
              <span className="block text-ink-3">Read: {source.sections}</span>
            </li>
          ))}
        </ul>
      </section>

      {concept.related.length ? (
        <section aria-labelledby="concept-related" className="mt-8">
          <ManSectionLabel as="h2" id="concept-related">
            Related pages
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
        <a href={conceptReportHref(concept, origin)} target="_blank" rel="noopener noreferrer" className="underline">
          Report a problem
        </a>{' '}
        with this explainer on GitHub.
      </p>
    </div>
  )
}
