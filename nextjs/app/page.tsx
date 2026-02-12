import Link from 'next/link'
import { cookies } from 'next/headers'

import { HomeDashboardClient } from './HomeDashboardClient'
import { fetchInfo, listSections } from '../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro, type Distro } from '../lib/distro'
import { formatRelativeTime } from '../lib/time'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = (normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian') satisfies Distro

  const [info, sections] = await Promise.all([fetchInfo(distro), listSections(distro)])
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="sr-only">BetterMan</h1>

      <section aria-label="Search" className="mt-6">
        <form action="/search" method="get" role="search" aria-label="Search man pages">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="shrink-0 font-mono text-3xl font-bold leading-none tracking-tight text-[var(--bm-accent)]"
            >
              $
            </div>
            <input
              name="q"
              type="search"
              autoComplete="off"
              placeholder="search man pages…"
              data-bm-home-search
              className="h-12 min-w-0 flex-1 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 font-mono text-sm text-[color:var(--bm-fg)] placeholder:text-[color:var(--bm-muted)] outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Search man pages"
            />
            {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[color:var(--bm-muted)]">
            <div className="flex items-center gap-2">
              <kbd className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-fg)]">
                /
              </kbd>
              <span className="font-mono">search</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-fg)]">
                ⌘K
              </kbd>
              <span className="font-mono">palette</span>
            </div>
          </div>
        </form>
      </section>

      <HomeDashboardClient distro={distro} />

      <section aria-label="Browse sections" className="mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Browse</h2>
          <div className="font-mono text-[11px] text-[color:var(--bm-muted)]">Sections 1–9</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visible.map((s) => (
            <Link
              key={s.section}
              href={withDistro(`/section/${encodeURIComponent(s.section)}`, distro)}
              className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-xs transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              title={s.label}
            >
              <span className="font-mono text-[color:var(--bm-fg)]">{s.section}</span>{' '}
              <span className="text-[color:var(--bm-muted)]">{s.label}</span>
            </Link>
          ))}
          {!visible.length ? <span className="text-sm text-[color:var(--bm-muted)]">Sections unavailable.</span> : null}
        </div>
      </section>

      <footer aria-label="Dataset stats" className="mt-12 border-t border-[var(--bm-border)] pt-4">
        <div className="font-mono text-xs text-[color:var(--bm-muted)]">
          Dataset {info.datasetReleaseId} · {info.pageCount.toLocaleString()} pages · updated {formatRelativeTime(info.lastUpdated)}
        </div>
      </footer>
    </div>
  )
}
