import Link from 'next/link'
import type { Metadata } from 'next'

import { HomeDashboardClient } from './HomeDashboardClient'
import { SearchPageInput } from '../search/SearchPageInput'
import { fetchInfo, listSections, search, withDistroFallback } from '../../lib/api'
import { matchConcepts } from '../../lib/concepts'
import { withDistro } from '../../lib/distro'
import { tRich } from '../../lib/i18n/rich'
import { localizedSeo } from '../../lib/i18n/seo'
import { getI18n } from '../../lib/i18n/server'
import { explicitDistro, explicitLang, getFirst, resolveRequestDistro, resolveRequestLang, type SearchParams } from '../../lib/requestContext'
import { sectionsLabel } from '../../lib/sectionsLabel'
import { bsdSectionLabel, ManSectionLabel, sectionLabel } from '../../components/man/RunningHead'
import { SearchResultsBody } from '../../components/search/SearchResultsBody'
import { Kbd } from '../../components/ui/Kbd'
import { LinkPendingHint } from '../../components/ui/LinkPendingHint'

/** Results shown under the home box; the search page has the rest. */
const HOME_RESULTS = 8

/** The living placeholder: one of each thing the box takes, typed as written. Static under reduced motion. */
const EXAMPLE_QUERIES = ['tar -xzvf', 'ssh_config ForwardAgent', 'extract a tarball', '--recursive', 'find . -name "*.log"'] as const

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams
  const q = getFirst(sp.q)?.trim()
  const { lang } = await getI18n(resolveRequestLang(sp))
  // Typing on home keeps `?q=` in the URL; those views are search results, not the home page.
  if (q) return { robots: { index: false, follow: true } }
  return localizedSeo(lang, withDistro('/', explicitDistro(sp)))
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const { t, lang } = await getI18n(resolveRequestLang(sp))
  const urlLang = explicitLang(sp)
  const q = getFirst(sp.q)?.trim().slice(0, 120) ?? ''

  const { distro, data } = await withDistroFallback(requestedDistro, async (activeDistro) =>
    Promise.all([
      fetchInfo(activeDistro),
      listSections(activeDistro),
      q ? search({ distro: activeDistro, q, limit: HOME_RESULTS, offset: 0, brief: true }) : Promise.resolve(null),
    ]),
  )
  const urlDistro = explicitDistro(sp)
  const [info, sections, results] = data
  // English keeps the dataset's own section names; another language names the sections as man does in that language. BSD systems name 4 and 7 their own way.
  const nameOf = (s: { section: string; label: string }) => bsdSectionLabel(s.section, distro, t) ?? (lang === 'en' ? s.label : sectionLabel(s.section, t))
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)
  const allResults = withDistro(`/search?q=${encodeURIComponent(q)}`, urlDistro, urlLang)
  const placeholders = EXAMPLE_QUERIES.map((example) => t('Try {example}', { example }))

  return (
    <div className={`mx-auto max-w-[40rem] ${q ? 'pt-8' : 'pt-[10vh] md:pt-[14vh]'}`}>
      <h1 className={`font-serif font-semibold tracking-[-0.015em] ${q ? 'text-2xl' : 'text-3xl md:text-[3rem]'}`}>
        betterman<span className="font-normal text-ink-3 oldstyle-nums">(1)</span>
      </h1>
      {q ? null : (
        <p className="mt-2.5 font-serif text-lg italic text-ink-2 md:text-[1.3125rem]">
          {t('The Unix manual, typeset for the screen.')}
        </p>
      )}

      {/* Without JavaScript the form opens /search; with it, typing keeps the results here. */}
      <form action="/search" method="get" role="search" aria-label={t('Search man pages')} className={q ? 'mt-4' : 'mt-10'}>
        <SearchPageInput
          initialQ={q}
          section=""
          path="/"
          home
          placeholders={placeholders}
          className="bm-field border-b-[1.5px] border-ink pt-2 focus-visible:border-accent pb-2.5 text-lg placeholder:font-serif placeholder:italic md:text-xl"
        />
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
        {urlLang ? <input type="hidden" name="lang" value={urlLang} /> : null}
        {q ? null : (
          <p className="mt-2.5 text-sm text-ink-3">
            {tRich(t, 'A command, a flag, a config directive, a task in plain words, or a {explain}, across {pages}.', {
              explain: (
                <a href={withDistro('/explain', urlDistro, urlLang)} className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                  {t('whole command line to explain')}
                </a>
              ),
              pages: t('{count, plural, one {# page} other {# pages}}', { count: info.pageCount }),
            })}{' '}
            <span className="bm-js whitespace-nowrap">
              <Kbd>/</Kbd> {t('search')} · <Kbd>⌘K</Kbd> {t('palette')}
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
          urlLang={urlLang}
          t={t}
          footer={
            results.hasMore ? (
              <p className="mt-4 text-sm">
                <Link href={allResults} className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                  {t('All results for “{q}”', { q })}
                </Link>
              </p>
            ) : null
          }
        />
      ) : (
        <>
          <HomeDashboardClient />

          <section aria-label={t('Browse sections')} className="mt-12">
            <div className="flex items-baseline justify-between gap-3">
              <ManSectionLabel as="h2">{t('Browse')}</ManSectionLabel>
              {visible.length ? <p className="text-xs text-ink-3">{sectionsLabel(visible.map((s) => s.section), t)}</p> : null}
            </div>
            <ul className="mt-1.5 grid gap-x-8 font-serif text-md sm:grid-cols-2">
              {visible.map((s) => (
                <li key={s.section} className="py-0.5">
                  <Link
                    href={withDistro(`/section/${encodeURIComponent(s.section)}`, urlDistro, urlLang)}
                    className="group no-underline"
                    title={nameOf(s)}
                  >
                    <span className="inline-block min-w-5 text-ink-3 oldstyle-nums">{s.section}</span>{' '}
                    <span className="group-hover:text-accent">{nameOf(s)}</span>
                    <LinkPendingHint />
                  </Link>
                </li>
              ))}
            </ul>
            {!visible.length ? <p className="mt-1.5 text-sm text-ink-3">{t('Sections unavailable.')}</p> : null}
          </section>
        </>
      )}
    </div>
  )
}
