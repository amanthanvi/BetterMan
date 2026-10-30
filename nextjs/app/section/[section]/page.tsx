import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { SectionFilter } from '../../../components/browse/SectionFilter'
import { bsdSectionLabel, RunningHead, sectionLabel } from '../../../components/man/RunningHead'
import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'
import { FastApiError, listSection, withDistroFallback } from '../../../lib/api'
import { DISTRO_LABEL, withDistro, type Distro } from '../../../lib/distro'
import type { Lang } from '../../../lib/i18n/locales'
import { tRich } from '../../../lib/i18n/rich'
import { localizedSeo } from '../../../lib/i18n/seo'
import { getI18n } from '../../../lib/i18n/server'
import { explicitDistro, explicitLang, getFirst, resolveRequestDistro, resolveRequestLang, type SearchParams } from '../../../lib/requestContext'

function getGroupKey(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  if (!first) return '#'
  if (first >= 'A' && first <= 'Z') return first
  if (first >= '0' && first <= '9') return first
  return '#'
}

function groupAnchorId(key: string): string {
  return key === '#' ? 'letter-other' : `letter-${key.toLowerCase()}`
}

function groupByLeadingChar<T extends { name: string }>(items: readonly T[]): Array<{ key: string; items: T[] }> {
  const groups: Array<{ key: string; items: T[] }> = []
  for (const item of items) {
    const key = getGroupKey(item.name)
    const last = groups.at(-1)
    if (!last || last.key !== key) {
      groups.push({ key, items: [item] })
      continue
    }
    last.items.push(item)
  }
  return groups
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const SECTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function buildSectionHref(opts: { section: string; urlDistro: Distro | null; urlLang: Lang | null; offset: number; cursor?: string | null; before?: string | null; from?: string | null }) {
  const params = new URLSearchParams()
  if (opts.offset > 0) params.set('offset', String(opts.offset))
  if (opts.cursor != null) params.set('cursor', opts.cursor)
  if (opts.before != null) params.set('before', opts.before)
  if (opts.from != null) params.set('from', opts.from)
  if (opts.urlDistro) params.set('distro', opts.urlDistro)
  if (opts.urlLang) params.set('lang', opts.urlLang)
  const qs = params.toString()
  return qs ? `/section/${encodeURIComponent(opts.section)}?${qs}` : `/section/${encodeURIComponent(opts.section)}`
}

function PaginationControl({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  const className = `text-sm ${disabled ? 'text-ink-3' : 'underline'}`

  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    )
  }

  return (
    <Link href={href} className={className}>
      {children}
      <LinkPendingHint />
    </Link>
  )
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { section } = await params
  const sp = await searchParams
  const { t, lang } = await getI18n(resolveRequestLang(sp))
  const title = t('{title} — BetterMan', { title: t('Section {section}', { section }) })
  const description = t('Browse BetterMan man pages in section {section}.', { section })
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    ...localizedSeo(lang, withDistro(`/section/${encodeURIComponent(section)}`, explicitDistro(sp))),
  }
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<SearchParams>
}) {
  const { section } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const { t, lang } = await getI18n(resolveRequestLang(sp))
  const urlLang = explicitLang(sp)
  const offset = Number.parseInt(getFirst(sp.offset) ?? '0', 10)
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0
  const cursor = getFirst(sp.cursor)
  const before = cursor === undefined ? getFirst(sp.before) : undefined
  // A letter jump: a single lowercase letter or digit, so it is never a free-form scan key.
  const rawFrom = cursor === undefined && before === undefined ? getFirst(sp.from)?.trim().toLowerCase() : undefined
  const from = rawFrom && /^[a-z0-9]$/.test(rawFrom) ? rawFrom : undefined
  // Old offset-only bookmarks cannot seek cheaply. Restart their browse at a
  // canonical first page instead of surfacing the backend cursor-required error.
  if (safeOffset > 5000 && cursor === undefined && before === undefined && from === undefined) {
    permanentRedirect(buildSectionHref({ section, urlDistro: explicitDistro(sp), urlLang, offset: 0 }))
  }

  const { distro, data } = await withDistroFallback(requestedDistro, (activeDistro) =>
    listSection({ distro: activeDistro, section, limit: 200, offset: from ? 0 : safeOffset, cursor, before, ...(from ? { from } : {}) }),
  ).catch((err: unknown) => {
    if (err instanceof FastApiError && err.status === 404) notFound()
    throw err
  })
  const urlDistro = explicitDistro(sp)
  const groups = groupByLeadingChar(data.results)
  // A letter jump lands mid-section at an unknown position; its pages and the
  // pages linked from them name their range instead of numbering it.
  const positioned = from === undefined && !((cursor !== undefined || before !== undefined) && getFirst(sp.offset) === undefined)
  const prevOffset = positioned ? Math.max(0, data.offset - data.limit) : 0
  const nextOffset = positioned ? data.offset + data.results.length : 0
  const hasPrevPage = data.prevCursor !== null
  const hasNextPage = data.nextCursor !== null
  const canRestart = data.results.length === 0 && (data.offset > 0 || cursor !== undefined || before !== undefined || from !== undefined)
  const onPage = new Set(groups.map((group) => group.key))
  // English keeps the dataset's own section name; another language names it as man does there.
  const sectionName = lang === 'en' ? (bsdSectionLabel(data.section, distro, t) ?? data.label) : sectionLabel(data.section, t, distro)
  const firstName = data.results[0]?.name
  const lastName = data.results.at(-1)?.name

  return (
    <div className="mx-auto max-w-[64rem]">
      <RunningHead title={t('Section {section}', { section: data.section })} label={sectionName} end={DISTRO_LABEL[distro]} />
      <header className="pt-9">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
          <span className="mr-[0.3em] font-normal text-ink-3 oldstyle-nums">{data.section}</span>
          {sectionName}
        </h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          {firstName && lastName && data.results.length > 1 && data.results.length < data.total
            ? tRich(
                t,
                '{count, plural, one {# page} other {# pages}} in {distro}; this page lists {first} to {last}.',
                {
                  first: <b className="font-semibold not-italic">{firstName}</b>,
                  last: <b className="font-semibold not-italic">{lastName}</b>,
                },
                { count: data.total, distro: DISTRO_LABEL[distro] },
              )
            : t('{count, plural, one {# page} other {# pages}} in {distro}.', { count: data.total, distro: DISTRO_LABEL[distro] })}
        </p>
        <nav aria-label={t('Sections')} className="mt-4 text-sm leading-[1.9] text-ink-3">
          {SECTIONS.map((n, index) => (
            <span key={n}>
              {index ? ' · ' : null}
              <Link
                href={withDistro(`/section/${n}`, urlDistro, urlLang)}
                aria-current={n === data.section ? 'page' : undefined}
                className={`whitespace-nowrap no-underline ${n === data.section ? 'font-semibold text-ink' : 'text-ink-2 hover:text-accent'}`}
              >
                <span className="font-serif text-[0.875rem] text-ink-3 oldstyle-nums">{n}</span> {sectionLabel(n, t, distro)}
              </Link>
            </span>
          ))}
        </nav>
      </header>

      <div className="sticky top-14 z-10 -mx-5 mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule bg-paper px-5 py-2.5 md:mx-0 md:px-0">
        <form className="flex min-w-0 flex-[0_1_22rem] items-baseline gap-3" action="/search" method="get" role="search" aria-label={t('Search section {section}', { section: data.section })}>
          <input type="hidden" name="section" value={data.section} />
          {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
          {urlLang ? <input type="hidden" name="lang" value={urlLang} /> : null}
          {/* Keyed by the page shown: a new page remounts the filter, clearing it and its hidden rows. */}
          <SectionFilter key={`${firstName}:${lastName}:${data.results.length}`} section={data.section} shown={data.results.length} />
        </form>

        {/* Every letter: on this page it jumps to its group; otherwise it starts a page there. */}
        <nav aria-label={t('Jump to letter')} className="flex flex-wrap font-serif text-[0.9375rem]">
          {LETTERS.map((letter) =>
            onPage.has(letter) ? (
              <a key={letter} href={`#${groupAnchorId(letter)}`} className="bm-az hover:text-accent">
                {letter}
              </a>
            ) : (
              // Plain anchors: 26 Link components would repeat their props in the RSC payload.
              <a key={letter} href={buildSectionHref({ section: data.section, urlDistro, urlLang, offset: 0, from: letter.toLowerCase() })} className="bm-az text-ink-3 hover:text-accent">
                {letter}
              </a>
            ),
          )}
        </nav>
      </div>

      {data.results.length === 0 ? (
        <p className="mt-8 font-serif text-lg italic text-ink-2">
          {data.total === 0
            ? t('Section {section} has no pages in {distro}.', { section: data.section, distro: DISTRO_LABEL[distro] })
            : from
              ? t('No names in section {section} start at {letter} or later.', { section: data.section, letter: from.toUpperCase() })
              : t('No more names in this section.')}
          {data.prevCursor ? (
            <>
              {' '}
              <Link href={buildSectionHref({ section: data.section, urlDistro, urlLang, offset: 0, before: data.prevCursor })} className="not-italic underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                {t('Last page')}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="mt-6 md:columns-2 md:gap-14" data-bm-section-list>
        {groups.map((group) => (
          <section key={group.key} aria-label={t('Names starting with {letter}', { letter: group.key })} data-bm-letter className="[&:first-child>h2]:mt-0">
            <h2
              id={groupAnchorId(group.key)}
              className="mt-5 mb-1.5 break-after-avoid scroll-mt-28 border-b border-rule pb-1 font-serif text-xl font-semibold"
            >
              {group.key}
            </h2>
            <ul className="font-serif text-[0.96875rem] leading-[1.45] [&>li]:break-inside-avoid [&>li]:py-[0.18rem] [&>li]:pl-[1.25em] [&>li]:-indent-[1.25em]">
              {group.items.map((r) => (
                <li key={`${r.name}:${r.section}`}>
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, urlDistro, urlLang)}
                    className="group no-underline"
                  >
                    <span className="group-hover:text-accent">
                      <b className="font-semibold">{r.name}</b>({r.section})
                    </span>{' '}
                    <span className="text-ink-2">{r.description}</span>
                    <LinkPendingHint />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3 border-t border-rule pt-4">
        <p className="text-xs text-ink-3">
          {data.results.length === 0
            ? t('Showing 0 of {total} results.', { total: data.total.toLocaleString(lang) })
            : positioned
              ? t('Showing {from}-{to} of {total} results.', { from: data.offset + 1, to: data.offset + data.results.length, total: data.total.toLocaleString(lang) })
              : t('Showing {first} to {last}, {count} of {total} results.', { first: firstName ?? '', last: lastName ?? '', count: data.results.length.toLocaleString(lang), total: data.total.toLocaleString(lang) })}
        </p>
        <div className="flex items-baseline gap-5">
          {canRestart ? (
            <PaginationControl href={buildSectionHref({ section: data.section, urlDistro, urlLang, offset: 0 })} disabled={false}>
              {t('First page')}
            </PaginationControl>
          ) : null}
          <PaginationControl
            href={buildSectionHref({ section: data.section, urlDistro, urlLang, offset: prevOffset, before: data.prevCursor })}
            disabled={!hasPrevPage}
          >
            {t('Previous')}
          </PaginationControl>
          <PaginationControl
            href={buildSectionHref({ section: data.section, urlDistro, urlLang, offset: nextOffset, cursor: data.nextCursor })}
            disabled={!hasNextPage}
          >
            {t('Next')}
          </PaginationControl>
        </div>
      </div>
    </div>
  )
}
