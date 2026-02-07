import Link from 'next/link'
import { cookies } from 'next/headers'

import { listSections, search } from '../../lib/api'
import { isDefaultDistro, normalizeDistro } from '../../lib/distro'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function withDistro(path: string, distro: string): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const q = getFirst(sp.q)?.trim() ?? ''
  const section = getFirst(sp.section)?.trim() || ''

  const sections = await listSections(distro)
  const sectionLabel = section ? sections.find((s) => s.section === section)?.label : undefined

  const results = q
    ? await search({
        distro,
        q,
        section: section || undefined,
        limit: 20,
        offset: 0,
      })
    : null

  const title = q ? `Search “${q}” — BetterMan` : 'Search — BetterMan'
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-2 border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--bm-muted)]">
          <div>Fast lookup across the current dataset.</div>
          {q ? (
            <div className="font-mono text-xs">
              {section ? `section ${section} · ` : ''}
              {(results?.results.length ?? 0).toLocaleString()} results loaded
            </div>
          ) : null}
        </div>
      </header>

      <form
        className="mt-6 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur"
        action="/search"
        method="get"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Type a command…"
            className="min-w-[16rem] flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search man pages"
            autoFocus
          />
          <select
            name="section"
            defaultValue={section}
            className="h-[3rem] rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Filter by section"
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.section} value={s.section}>
                {s.section}: {s.label}
              </option>
            ))}
          </select>
          {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-6 py-3 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
          >
            Search
          </button>
        </div>

        <div className="mt-3 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">Tip:</span> Use <span className="font-mono">ssh_config</span> or{' '}
          <span className="font-mono">systemd.unit</span> for dotted names.
        </div>
      </form>

      {!q ? (
        <div className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
          Try <span className="font-medium text-[var(--bm-fg)]">tar</span>,{' '}
          <span className="font-medium text-[var(--bm-fg)]">ssh</span>, or{' '}
          <span className="font-medium text-[var(--bm-fg)]">systemd.unit</span>.
        </div>
      ) : results && results.results.length ? (
        <div className="mt-8">
          <div className="mb-3 text-xs text-[color:var(--bm-muted)]">
            {section ? (
              <>
                Filtering: <span className="font-mono">{section}</span>{' '}
                <span className="text-[color:var(--bm-muted)]">{sectionLabel ?? ''}</span>
              </>
            ) : (
              <span>All sections</span>
            )}
          </div>
          <ol className="space-y-3">
            {results.results.map((r) => (
              <li
                key={`${r.name}:${r.section}`}
                className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, distro)}
                    className="font-mono text-base font-semibold tracking-tight underline underline-offset-4"
                  >
                    {r.name}({r.section})
                  </Link>
                  <div className="text-xs text-[color:var(--bm-muted)]">{r.title}</div>
                </div>
                <div className="mt-2 text-sm text-[color:var(--bm-muted)]">{r.description}</div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
          No results.
          {results?.suggestions?.length ? (
            <>
              {' '}
              Try:{' '}
              {results.suggestions.map((s, idx) => (
                <span key={s}>
                  {idx ? ', ' : ''}
                  <Link
                    href={withDistro(`/search?q=${encodeURIComponent(s)}`, distro)}
                    className="underline underline-offset-4"
                  >
                    {s}
                  </Link>
                </span>
              ))}
              .
            </>
          ) : null}
        </div>
      )}

      <div className="mt-10 text-xs text-[color:var(--bm-muted)]">
        <span className="font-mono">{title}</span>
      </div>
    </div>
  )
}
