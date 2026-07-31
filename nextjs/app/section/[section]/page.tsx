import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

import { listSection, withDistroFallback } from '../../../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro, type Distro } from '../../../lib/distro'

export const revalidate = 3600

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

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

function buildSectionHref(opts: { section: string; distro: Distro; offset: number }) {
  const params = new URLSearchParams()
  if (opts.offset > 0) params.set('offset', String(opts.offset))
  if (!isDefaultDistro(opts.distro)) params.set('distro', opts.distro)
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
  const className = `rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:no-underline ${
    disabled
      ? 'border-edge bg-surface text-muted opacity-50'
      : 'border-edge bg-surface text-fg hover:border-edge-strong hover:bg-raised'
  }`

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
      images: ['/og-image.png'],
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
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const requestedDistro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'
  const offset = Number.parseInt(getFirst(sp.offset) ?? '0', 10)
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0

  const { distro, data } = await withDistroFallback(requestedDistro, (activeDistro) =>
    listSection({ distro: activeDistro, section, limit: 200, offset: safeOffset }),
  )
  const groups = groupByLeadingChar(data.results)
  const prevOffset = Math.max(0, data.offset - data.limit)
  const nextOffset = data.offset + data.results.length
  const hasPrevPage = data.offset > 0
  const hasNextPage = nextOffset < data.total

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-edge pb-6">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-2xl font-semibold leading-none tracking-tight">{data.section}</span>
          <span className="text-muted">—</span>
          <span className="text-xl font-semibold leading-none tracking-tight">{data.label}</span>
        </h1>
        <p className="mt-2 font-mono text-xs text-faint">{data.total.toLocaleString()} pages</p>

        <form className="mt-5" action="/search" method="get">
          <input type="hidden" name="section" value={data.section} />
          {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="q"
              placeholder="Search within section…"
              className="h-10 min-w-[16rem] flex-1 rounded-md border border-edge bg-surface px-3 font-mono text-sm text-fg transition-colors placeholder:text-muted hover:border-edge-strong"
              aria-label="Search within section"
            />
            <button
              type="submit"
              className="h-10 rounded-md border border-edge bg-surface px-4 text-sm font-medium text-fg transition-colors hover:border-edge-strong hover:bg-raised"
            >
              Search
            </button>
          </div>
        </form>
      </header>

      {groups.length > 3 ? (
        <nav aria-label="Jump to letter" className="mt-6 flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <a
              key={group.key}
              href={`#${groupAnchorId(group.key)}`}
              className="inline-flex size-7 items-center justify-center rounded-sm border border-edge bg-surface font-mono text-xs text-muted transition-colors hover:border-edge-strong hover:text-fg hover:no-underline"
            >
              {group.key}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="mt-6">
        {groups.map((group) => (
          <section key={group.key} aria-label={`Names starting with ${group.key}`}>
            <h2
              id={groupAnchorId(group.key)}
              className="sticky top-14 z-10 -mx-4 scroll-mt-14 border-b border-edge bg-bg px-4 py-2 font-mono text-xs font-semibold text-muted"
            >
              {group.key}
            </h2>
            <ul>
              {group.items.map((r) => (
                <li key={`${r.name}:${r.section}`} className="border-b border-edge last:border-b-0">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, distro)}
                    className="block px-1 py-3 transition-colors hover:bg-raised hover:no-underline sm:px-2"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="shrink-0 font-mono text-sm font-semibold leading-tight text-accent">
                        {r.name}({r.section})
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm leading-snug text-muted">{r.description}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs text-faint">
          {data.results.length === 0
            ? `Showing 0 of ${data.total.toLocaleString()} results.`
            : `Showing ${data.offset + 1}-${data.offset + data.results.length} of ${data.total.toLocaleString()} results.`}
        </div>
        <div className="flex items-center gap-2">
          <PaginationControl
            href={buildSectionHref({ section: data.section, distro, offset: prevOffset })}
            disabled={!hasPrevPage}
          >
            Previous
          </PaginationControl>
          <PaginationControl
            href={buildSectionHref({ section: data.section, distro, offset: nextOffset })}
            disabled={!hasNextPage}
          >
            Next
          </PaginationControl>
        </div>
      </div>
    </div>
  )
}
