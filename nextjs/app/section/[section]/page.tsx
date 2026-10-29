import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { RunningHead } from '../../../components/man/RunningHead'
import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'
import { FastApiError, listSection, withDistroFallback } from '../../../lib/api'
import { DISTRO_LABEL, withDistro, type Distro } from '../../../lib/distro'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'

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

function buildSectionHref(opts: { section: string; urlDistro: Distro | null; offset: number; cursor?: string | null; before?: string | null }) {
  const params = new URLSearchParams()
  if (opts.offset > 0) params.set('offset', String(opts.offset))
  if (opts.cursor != null) params.set('cursor', opts.cursor)
  if (opts.before != null) params.set('before', opts.before)
  if (opts.urlDistro) params.set('distro', opts.urlDistro)
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

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params
  const title = `Section ${section} — BetterMan`
  return {
    title,
    description: `Browse BetterMan man pages in section ${section}.`,
    openGraph: {
      title,
      description: `Browse BetterMan man pages in section ${section}.`,
      type: 'website',
    },
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
  const offset = Number.parseInt(getFirst(sp.offset) ?? '0', 10)
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0
  const cursor = getFirst(sp.cursor)
  const before = cursor === undefined ? getFirst(sp.before) : undefined
  // Old offset-only bookmarks cannot seek cheaply. Restart their browse at a
  // canonical first page instead of surfacing the backend cursor-required error.
  if (safeOffset > 5000 && cursor === undefined && before === undefined) {
    permanentRedirect(buildSectionHref({ section, urlDistro: explicitDistro(sp), offset: 0 }))
  }

  const { distro, data } = await withDistroFallback(requestedDistro, (activeDistro) =>
    listSection({ distro: activeDistro, section, limit: 200, offset: safeOffset, cursor, before }),
  ).catch((err: unknown) => {
    if (err instanceof FastApiError && err.status === 404) notFound()
    throw err
  })
  const urlDistro = explicitDistro(sp)
  const groups = groupByLeadingChar(data.results)
  const prevOffset = Math.max(0, data.offset - data.limit)
  const nextOffset = data.offset + data.results.length
  const hasPrevPage = data.prevCursor !== null
  const hasNextPage = data.nextCursor !== null
  const canRestart = data.results.length === 0 && (data.offset > 0 || cursor !== undefined || before !== undefined)

  return (
    <div className="mx-auto max-w-[64rem]">
      <RunningHead title={`Section ${data.section}`} label={data.label} end={DISTRO_LABEL[distro]} />
      <header className="pt-9">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
          <span className="mr-[0.3em] font-normal text-ink-3 oldstyle-nums">{data.section}</span>
          {data.label}
        </h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          {data.total.toLocaleString()} pages in {DISTRO_LABEL[distro]}.
        </p>
      </header>

      <div className="sticky top-14 z-10 -mx-5 mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule bg-paper px-5 py-2.5 md:mx-0 md:px-0">
        <form className="flex min-w-0 flex-[0_1_18rem] items-baseline gap-3" action="/search" method="get">
          <input type="hidden" name="section" value={data.section} />
          {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
          <input
            name="q"
            type="search"
            placeholder={`Search section ${data.section}`}
            className="bm-field py-1 text-sm"
            aria-label="Search within section"
          />
          <button type="submit" className="text-sm text-ink-2 underline hover:text-accent">
            Search
          </button>
        </form>

        {groups.length > 3 ? (
          <nav aria-label="Jump to letter" className="flex flex-wrap font-serif text-[0.9375rem]">
            {groups.map((group) => (
              <a
                key={group.key}
                href={`#${groupAnchorId(group.key)}`}
                className="inline-grid h-7 w-6 place-items-center no-underline hover:text-accent"
              >
                {group.key}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="mt-6 md:columns-2 md:gap-14">
        {groups.map((group) => (
          <section key={group.key} aria-label={`Names starting with ${group.key}`} className="[&:first-child>h2]:mt-0">
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
                    href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, urlDistro)}
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
            ? `Showing 0 of ${data.total.toLocaleString()} results.`
            : `Showing ${data.offset + 1}-${data.offset + data.results.length} of ${data.total.toLocaleString()} results.`}
        </p>
        <div className="flex items-baseline gap-5">
          {canRestart ? (
            <PaginationControl href={buildSectionHref({ section: data.section, urlDistro, offset: 0 })} disabled={false}>
              First page
            </PaginationControl>
          ) : null}
          <PaginationControl
            href={buildSectionHref({ section: data.section, urlDistro, offset: prevOffset, before: data.prevCursor })}
            disabled={!hasPrevPage}
          >
            Previous
          </PaginationControl>
          <PaginationControl
            href={buildSectionHref({ section: data.section, urlDistro, offset: nextOffset, cursor: data.nextCursor })}
            disabled={!hasNextPage}
          >
            Next
          </PaginationControl>
        </div>
      </div>
    </div>
  )
}
