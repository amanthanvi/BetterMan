import Link from 'next/link'
import type { Metadata } from 'next'

import { listSections, search, withDistroFallback } from '../../../lib/api'
import type { Distro } from '../../../lib/distro'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'
import { SearchPageInput } from './SearchPageInput'
import { SearchResultsClient } from './SearchResultsClient'

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

  const { distro, data } = await withDistroFallback(requestedDistro, async (activeDistro) => {
    const sectionsPromise = listSections(activeDistro)
    const initialPromise = q
      ? search({
          distro: activeDistro,
          q,
          section: section || undefined,
          limit: 20,
          offset: 0,
        })
      : Promise.resolve(null)

    return Promise.all([sectionsPromise, initialPromise])
  })
  const [sections, initial] = data
  const urlDistro = explicitDistro(sp)
  const sectionPills = sections
    .filter((s) => /^\d+$/.test(s.section))
    .map((s) => ({ section: s.section, n: Number.parseInt(s.section, 10), label: s.label }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n)
    .slice(0, 9)

  const sectionLinkClass = (active: boolean) =>
    active ? 'font-semibold text-ink no-underline' : 'text-ink-2 no-underline hover:text-accent'

  return (
    <div className="mx-auto max-w-[46rem] pt-10">
      <h1 className="font-serif text-2xl font-semibold tracking-[-0.01em]">Search the manual</h1>

      <form className="mt-6" action="/search" method="get" role="search" aria-label="Search man pages">
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

      <SearchResultsClient distro={distro} q={q} section={section} initial={initial} />
    </div>
  )
}
