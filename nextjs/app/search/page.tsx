import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

import type { Distro } from '../../lib/distro'
import { listSections, search } from '../../lib/api'
import { isDefaultDistro, normalizeDistro } from '../../lib/distro'
import { SearchResultsClient } from './SearchResultsClient'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildSearchHref(opts: { q: string; section: string; distro: Distro }) {
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  if (opts.section) params.set('section', opts.section)
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return qs ? `/search?${qs}` : '/search'
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams
  const q = getFirst(sp.q)?.trim() ?? ''
  const title = q ? `Search “${q}” — BetterMan` : 'Search — BetterMan'
  const description = q ? `Search results for “${q}”.` : 'Search the BetterMan dataset.'
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: 'website', images: ['/og-image.png'] },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = (normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian') satisfies Distro

  const q = getFirst(sp.q)?.trim() ?? ''
  const section = getFirst(sp.section)?.trim() || ''

  const sectionsPromise = listSections(distro)
  const initialPromise = q
    ? search({
        distro,
        q,
        section: section || undefined,
        limit: 20,
        offset: 0,
      })
    : Promise.resolve(null)

  const [sections, initial] = await Promise.all([sectionsPromise, initialPromise])
  const sectionPills = sections
    .filter((s) => /^\d+$/.test(s.section))
    .map((s) => ({ section: s.section, n: Number.parseInt(s.section, 10), label: s.label }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n)
    .slice(0, 9)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>

        <form className="mt-4" action="/search" method="get" role="search" aria-label="Search man pages">
          <input
            key={`${distro}:${section}:${q}`}
            name="q"
            type="search"
            defaultValue={q}
            placeholder="search man pages…"
            data-bm-page-search
            autoComplete="off"
            className="h-12 w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-4 font-mono text-sm text-[color:var(--bm-fg)] placeholder:text-[color:var(--bm-muted)] outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search man pages"
          />
          {section ? <input type="hidden" name="section" value={section} /> : null}
          {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
        </form>

        <nav aria-label="Section filter" className="mt-4 flex flex-wrap gap-2">
          <Link
            href={buildSearchHref({ q, section: '', distro })}
            className={`rounded-[var(--bm-radius-sm)] border px-3 py-1 font-mono text-xs transition-colors ${
              !section
                ? 'border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] text-[color:var(--bm-fg)]'
                : 'border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]'
            }`}
          >
            All
          </Link>
          {sectionPills.map((s) => (
            <Link
              key={s.section}
              href={buildSearchHref({ q, section: s.section, distro })}
              className={`rounded-[var(--bm-radius-sm)] border px-3 py-1 font-mono text-xs transition-colors ${
                section === s.section
                  ? 'border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] text-[color:var(--bm-fg)]'
                  : 'border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]'
              }`}
              title={s.label}
              aria-label={`Section ${s.section}: ${s.label}`}
            >
              {s.section}
            </Link>
          ))}
        </nav>

        <div className="mt-3 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">Tip:</span> Use <span className="font-mono">ssh_config</span> or{' '}
          <span className="font-mono">systemd.unit</span> for dotted names.
        </div>
      </header>

      <SearchResultsClient distro={distro} q={q} section={section} initial={initial} />
    </div>
  )
}
