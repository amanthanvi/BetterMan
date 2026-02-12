import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { Fragment } from 'react'

import { listSection } from '../../../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro } from '../../../lib/distro'

export const dynamic = 'force-dynamic'

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
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const data = await listSection({ distro, section, limit: 200, offset: 0 })
  const groups = groupByLeadingChar(data.results)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[32px] font-bold leading-none tracking-tight">{data.section}</span>
          <span className="text-[color:var(--bm-muted)]">—</span>
          <span className="text-[24px] font-semibold leading-none tracking-tight">{data.label}</span>
        </h1>
        <p className="mt-2 font-mono text-[11px] text-[color:var(--bm-muted)]">{data.total.toLocaleString()} pages</p>
      </header>

      <form
        className="mt-6 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4"
        action="/search"
        method="get"
      >
        <input type="hidden" name="section" value={data.section} />
        {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            placeholder="Search within section…"
            className="h-10 min-w-[16rem] flex-1 rounded-md border border-[var(--bm-border)] bg-[var(--bm-bg)] px-3 font-mono text-[13px] text-[color:var(--bm-fg)] outline-none placeholder:text-[color:var(--bm-muted)] focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search within section"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-[var(--bm-border-accent)] bg-[var(--bm-accent)] px-4 text-[13px] font-semibold text-[var(--bm-accent-contrast)] hover:bg-[var(--bm-accent-hover)]"
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-8">
        <ol className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)]">
          {groups.map((group) => (
            <Fragment key={group.key}>
              <li
                className="sticky top-12 z-10 border-b border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 py-2"

              >
                <span className="inline-flex items-center rounded-[var(--bm-radius-sm)] border border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--bm-accent)]">
                  {group.key}
                </span>
              </li>
              {group.items.map((r) => (
                <li key={`${r.name}:${r.section}`} className="border-b border-[var(--bm-border)] last:border-b-0">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, distro)}
                    className="block px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[13px] font-semibold leading-tight text-[color:var(--bm-fg)]">
                          {r.name}({r.section})
                        </div>
                        <div className="mt-1 truncate text-[13px] leading-snug text-[color:var(--bm-muted)]">
                          {r.description}
                        </div>
                      </div>
                      <span className="hidden font-mono text-[11px] text-[color:var(--bm-muted)] sm:block">↵</span>
                    </div>
                  </Link>
                </li>
              ))}
            </Fragment>
          ))}
        </ol>

        {data.total > data.results.length ? (
          <div className="mt-6 font-mono text-[11px] text-[color:var(--bm-muted)]">
            Showing first {data.results.length.toLocaleString()} results. Use search to find more.
          </div>
        ) : null}
      </div>
    </div>
  )
}
