import Link from 'next/link'
import { cookies } from 'next/headers'

import { fetchInfo, listSections } from '../lib/api'
import { isDefaultDistro, normalizeDistro } from '../lib/distro'
import { formatRelativeTime } from '../lib/time'

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

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const [info, sections] = await Promise.all([fetchInfo(distro), listSections(distro)])
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)
  const distroParam = isDefaultDistro(distro) ? '' : `&distro=${encodeURIComponent(distro)}`

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
        Man pages,
        <span className="block text-[color:var(--bm-muted)]">but readable.</span>
      </h1>
      <p className="mt-4 max-w-[60ch] text-base text-[color:var(--bm-muted)]">
        BetterMan is a fast web UI for man pages — search-first, keyboard-friendly, and built for reading.
      </p>

      <form
        className="mt-10 rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-5 shadow-sm backdrop-blur"
        action="/search"
        method="get"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            name="q"
            placeholder="Search (e.g. tar, ssh_config, curl)…"
            className="min-w-0 flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search man pages"
          />
          {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-6 py-3 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
          >
            Search
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">Try:</span>
          <Link
            href={`/search?q=tar${distroParam}`}
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono text-[11px] text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-bg)/0.55]"
          >
            tar
          </Link>
          <Link
            href={`/search?q=ssh_config${distroParam}`}
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono text-[11px] text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-bg)/0.55]"
          >
            ssh_config
          </Link>
          <Link
            href={`/search?q=curl${distroParam}`}
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono text-[11px] text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-bg)/0.55]"
          >
            curl
          </Link>
          <Link
            href={`/search?q=systemd.unit${distroParam}`}
            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono text-[11px] text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-bg)/0.55]"
          >
            systemd.unit
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--bm-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-mono">Keys:</span>
            <span className="font-mono">/</span> search
            <span className="font-mono">Ctrl/⌘K</span> palette
          </div>
          <div className="font-mono text-[10px] text-[color:var(--bm-muted)] sm:text-xs">
            Dataset {info.datasetReleaseId} · {info.pageCount.toLocaleString()} pages · updated{' '}
            {formatRelativeTime(info.lastUpdated)}
          </div>
        </div>
      </form>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Browse</h2>
          <div className="text-xs text-[color:var(--bm-muted)]">Sections 1–9</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visible.map((s) => (
            <Link
              key={s.section}
              href={withDistro(`/section/${encodeURIComponent(s.section)}`, distro)}
              className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs hover:bg-[color:var(--bm-bg)/0.55]"
              title={s.label}
            >
              <span className="font-mono">{s.section}</span>{' '}
              <span className="text-[color:var(--bm-muted)]">{s.label}</span>
            </Link>
          ))}
          {!visible.length ? (
            <span className="text-sm text-[color:var(--bm-muted)]">Sections unavailable.</span>
          ) : null}
        </div>
      </section>
    </div>
  )
}
