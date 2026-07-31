import Link from 'next/link'
import { cookies } from 'next/headers'

import { HomeDashboardClient } from './HomeDashboardClient'
import { fetchInfo, listSections, withDistroFallback } from '../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro, type Distro } from '../lib/distro'
import { Kbd } from '../components/ui/Kbd'

export const revalidate = 3600

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const requestedDistro = (normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian') satisfies Distro

  const { distro, data } = await withDistroFallback(requestedDistro, async (activeDistro) =>
    Promise.all([fetchInfo(activeDistro), listSections(activeDistro)]),
  )
  const [info, sections] = data
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)

  return (
    <div className="mx-auto max-w-3xl">
      <section aria-label="Search" className="mt-8 sm:mt-16">
        <h1 className="text-2xl font-semibold tracking-tight">Man pages, readable.</h1>
        <p className="mt-1.5 text-sm text-muted">
          {info.pageCount.toLocaleString()} Unix manual pages. Keyboard-first, no accounts.
        </p>

        <form action="/search" method="get" role="search" aria-label="Search man pages" className="mt-6">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="shrink-0 font-mono text-2xl font-bold leading-none text-accent">
              $
            </div>
            <input
              name="q"
              type="search"
              autoComplete="off"
              placeholder="search man pages…"
              data-bm-home-search
              className="h-12 min-w-0 flex-1 rounded-md border border-edge bg-surface px-4 font-mono text-sm text-fg transition-colors placeholder:text-muted hover:border-edge-strong"
              aria-label="Search man pages"
            />
            {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 pl-8 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <Kbd>/</Kbd>
              <span className="font-mono">search</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Kbd>⌘K</Kbd>
              <span className="font-mono">palette</span>
            </div>
          </div>
        </form>
      </section>

      <HomeDashboardClient distro={distro} />

      <section aria-label="Browse sections" className="mt-12 mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-xs tracking-wide text-muted">Browse</h2>
          <div className="font-mono text-xs text-faint">Sections 1–9</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visible.map((s) => (
            <Link
              key={s.section}
              href={withDistro(`/section/${encodeURIComponent(s.section)}`, distro)}
              className="rounded-md border border-edge bg-surface px-3 py-2 text-xs transition-colors hover:border-edge-strong hover:bg-raised hover:no-underline"
              title={s.label}
            >
              <span className="font-mono text-fg">{s.section}</span>{' '}
              <span className="text-muted">{s.label}</span>
            </Link>
          ))}
          {!visible.length ? <span className="text-sm text-muted">Sections unavailable.</span> : null}
        </div>
      </section>
    </div>
  )
}
