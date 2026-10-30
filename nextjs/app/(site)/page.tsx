import Link from 'next/link'
import type { Metadata } from 'next'

import { HomeDashboardClient } from './HomeDashboardClient'
import { SearchPageInput } from '../search/SearchPageInput'
import { fetchInfo, listSections, search, withDistroFallback } from '../../lib/api'
import { matchConcepts } from '../../lib/concepts'
import { withDistro } from '../../lib/distro'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../lib/requestContext'
import { sectionsLabel } from '../../lib/sectionsLabel'
import { ManSectionLabel } from '../../components/man/RunningHead'
import { SearchResultsBody } from '../../components/search/SearchResultsBody'
import { Kbd } from '../../components/ui/Kbd'
import { LinkPendingHint } from '../../components/ui/LinkPendingHint'

/** Results shown under the home box; the search page has the rest. */
const HOME_RESULTS = 8

/** The living placeholder: one of each thing the box takes. Static under reduced motion. */
const PLACEHOLDERS = ['Try tar -xzvf', 'Try ssh_config ForwardAgent', 'Try extract a tarball', 'Try --recursive', 'Try find . -name "*.log"'] as const

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const q = getFirst((await searchParams).q)?.trim()
  // Typing on home keeps `?q=` in the URL; those views are search results, not the home page.
  return q ? { robots: { index: false, follow: true } } : {}
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const q = getFirst(sp.q)?.trim().slice(0, 120) ?? ''

  const { data } = await withDistroFallback(requestedDistro, async (activeDistro) =>
    Promise.all([
      fetchInfo(activeDistro),
      listSections(activeDistro),
      q ? search({ distro: activeDistro, q, limit: HOME_RESULTS, offset: 0, brief: true }) : Promise.resolve(null),
    ]),
  )
  const urlDistro = explicitDistro(sp)
  const [info, sections, results] = data
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)
  const allResults = withDistro(`/search?q=${encodeURIComponent(q)}`, urlDistro)

  return (
    <div className={`mx-auto max-w-[40rem] ${q ? 'pt-8' : 'pt-[10vh] md:pt-[14vh]'}`}>
      <h1 className={`font-serif font-semibold tracking-[-0.015em] ${q ? 'text-2xl' : 'text-3xl md:text-[3rem]'}`}>
        betterman<span className="font-normal text-ink-3 oldstyle-nums">(1)</span>
      </h1>
      {q ? null : (
        <p className="mt-2.5 font-serif text-lg italic text-ink-2 md:text-[1.3125rem]">
          The Unix manual, typeset for the screen.
        </p>
      )}

      {/* Without JavaScript the form opens /search; with it, typing keeps the results here. */}
      <form action="/search" method="get" role="search" aria-label="Search man pages" className={q ? 'mt-4' : 'mt-10'}>
        <SearchPageInput
          initialQ={q}
          section=""
          path="/"
          home
          placeholders={PLACEHOLDERS}
          className="bm-field border-b-[1.5px] border-ink pt-2 focus-visible:border-accent pb-2.5 text-lg placeholder:font-serif placeholder:italic md:text-xl"
        />
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
        {q ? null : (
          <p className="mt-2.5 text-sm text-ink-3">
            A command, a flag, a config directive, a task in plain words, or a{' '}
            <a href={withDistro('/explain', urlDistro)} className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
              whole command line to explain
            </a>
            , across {info.pageCount.toLocaleString()} pages.{' '}
            <span className="bm-js whitespace-nowrap">
              <Kbd>/</Kbd> search · <Kbd>⌘K</Kbd> palette
            </span>
          </p>
        )}
      </form>

      {results ? (
        <SearchResultsBody
          q={q}
          section=""
          results={results.results}
          suggestions={results.results.length && !results.correctedQuery ? [] : results.suggestions.filter((s) => s.toLowerCase() !== q.toLowerCase())}
          top={results.top}
          urlDistro={urlDistro}
          concepts={matchConcepts(q)}
          footer={
            results.hasMore ? (
              <p className="mt-4 text-sm">
                <Link href={allResults} className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                  All results for “{q}”
                </Link>
              </p>
            ) : null
          }
        />
      ) : (
        <>
          <HomeDashboardClient />

          <section aria-label="Browse sections" className="mt-12">
            <div className="flex items-baseline justify-between gap-3">
              <ManSectionLabel as="h2">Browse</ManSectionLabel>
              {visible.length ? <p className="text-xs text-ink-3">{sectionsLabel(visible.map((s) => s.section))}</p> : null}
            </div>
            <ul className="mt-1.5 grid gap-x-8 font-serif text-md sm:grid-cols-2">
              {visible.map((s) => (
                <li key={s.section} className="py-0.5">
                  <Link
                    href={withDistro(`/section/${encodeURIComponent(s.section)}`, urlDistro)}
                    className="group no-underline"
                    title={s.label}
                  >
                    <span className="inline-block min-w-5 text-ink-3 oldstyle-nums">{s.section}</span>{' '}
                    <span className="group-hover:text-accent">{s.label}</span>
                    <LinkPendingHint />
                  </Link>
                </li>
              ))}
            </ul>
            {!visible.length ? <p className="mt-1.5 text-sm text-ink-3">Sections unavailable.</p> : null}
          </section>
        </>
      )}
    </div>
  )
}
