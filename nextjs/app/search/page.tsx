import Link from 'next/link'
import type { Metadata } from 'next'

import { search, withDistroFallback } from '../../lib/api'
import { matchConcepts } from '../../lib/concepts'
import { sectionLabel } from '../../components/man/RunningHead'
import type { Distro } from '../../lib/distro'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../lib/requestContext'
import { SearchPageInput } from './SearchPageInput'
import { SearchResultsClient } from './SearchResultsClient'

const SECTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function buildSearchHref(opts: { q: string; section: string; urlDistro: Distro | null }) {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  if (opts.section) params.set('section', opts.section)
  if (opts.urlDistro) params.set('distro', opts.urlDistro)
  const qs = params.toString()
  return qs ? `/search?${qs}` : '/search'
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams
  const q = getFirst(sp.q)?.trim().slice(0, 120) ?? ''
  const title = q ? `Search “${q}” — BetterMan` : 'Search — BetterMan'
  const description = q ? `Search results for “${q}”.` : 'Search the BetterMan dataset.'
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: 'website' },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)

  const q = getFirst(sp.q)?.trim().slice(0, 120) ?? ''
  const section = getFirst(sp.section)?.trim() || ''

  const { distro, data: initial } = await withDistroFallback(requestedDistro, async (activeDistro) =>
    q ? search({ distro: activeDistro, q, section: section || undefined, limit: 20, offset: 0, brief: true }) : null,
  )
  const urlDistro = explicitDistro(sp)
  // The nine manual sections, without a per-view listing read; an empty one simply finds nothing.
  const sectionPills = SECTIONS.map((n) => ({ section: n, label: sectionLabel(n) }))

  const sectionLinkClass = (active: boolean) =>
    active ? 'font-semibold text-ink no-underline' : 'text-ink-2 no-underline hover:text-accent'

  return (
    <div className="mx-auto max-w-[46rem] pt-10">
      {/* No display heading on search (fix 9): the field is the page's title. */}
      <h1 className="sr-only">Search the manual</h1>

      <form action="/search" method="get" role="search" aria-label="Search man pages">
        <SearchPageInput initialQ={q} section={section} />
        {section ? <input type="hidden" name="section" value={section} /> : null}
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
      </form>

      <nav aria-label="Section filter" className="mt-4 text-sm leading-[1.9] text-ink-3">
        <Link
          href={buildSearchHref({ q, section: '', urlDistro })}
          aria-current={!section ? 'page' : undefined}
          className={sectionLinkClass(!section)}
        >
          All sections
        </Link>
        {sectionPills.map((s) => (
          <span key={s.section}>
            {' · '}
            <Link
              href={buildSearchHref({ q, section: s.section, urlDistro })}
              aria-current={section === s.section ? 'page' : undefined}
              className={`whitespace-nowrap ${sectionLinkClass(section === s.section)}`}
              title={s.label}
              aria-label={`Section ${s.section}: ${s.label}`}
            >
              <span className="font-serif text-[0.875rem] text-ink-3 oldstyle-nums">{s.section}</span> {s.label}
            </Link>
          </span>
        ))}
      </nav>

      <SearchResultsClient distro={distro} q={q} section={section} initial={initial} concepts={q ? matchConcepts(q) : []} />
    </div>
  )
}
