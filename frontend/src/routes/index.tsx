import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { fetchInfo, listSections } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { formatRelativeTime } from '../lib/time'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

function IndexPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  return (
    <div className="mx-auto max-w-4xl py-14">
      <header className="text-center">
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
          Man pages,
          <span className="block text-[color:var(--bm-muted)]">but readable.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[60ch] text-base text-[color:var(--bm-muted)]">
          BetterMan is a fast web UI for Linux man pages — search-first, keyboard-friendly, and
          built for reading.
        </p>
      </header>

      <form
        className="mt-10 rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-5 shadow-sm backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault()
          const query = q.trim()
          if (!query) return
          navigate({ to: '/search', search: { q: query } })
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            data-bm-home-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search (e.g. tar, ssh_config, curl)…"
            className="min-w-0 flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search man pages"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-6 py-3 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
          >
            Search
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">Try:</span>
          <QuickQuery q="tar" />
          <QuickQuery q="ssh_config" />
          <QuickQuery q="curl" />
          <QuickQuery q="systemd.unit" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--bm-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-mono">Keys:</span>
            <span className="font-mono">/</span> search
            <span className="font-mono">Ctrl/⌘K</span> palette
          </div>
          <HomeDatasetLine />
        </div>
      </form>

      <HomeBrowse />
    </div>
  )
}

function HomeDatasetLine() {
  const infoQuery = useQuery({
    queryKey: queryKeys.info(),
    queryFn: () => fetchInfo(),
    staleTime: 5 * 60_000,
  })

  if (!infoQuery.data) return null
  return (
    <div className="font-mono text-[10px] text-[color:var(--bm-muted)] sm:text-xs">
      Dataset {infoQuery.data.datasetReleaseId} · {infoQuery.data.pageCount.toLocaleString()} pages · updated{' '}
      {formatRelativeTime(infoQuery.data.lastUpdated)}
    </div>
  )
}

function HomeBrowse() {
  const sectionsQuery = useQuery({
    queryKey: ['sections'],
    queryFn: () => listSections(),
    staleTime: 60 * 60_000,
  })

  const visible = sectionsQuery.data?.filter((s) => /^\d+$/.test(s.section)).slice(0, 9) ?? []

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Browse</h2>
        <div className="text-xs text-[color:var(--bm-muted)]">Sections 1–9</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((s) => {
          const label = stripSectionPrefix(s.section, s.label)
          return (
            <Link
              key={s.section}
              to="/section/$section"
              params={{ section: s.section }}
              className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs hover:bg-[color:var(--bm-bg)/0.55]"
              title={label}
            >
              <span className="font-mono">{s.section}</span>{' '}
              <span className="text-[color:var(--bm-muted)]">{label}</span>
            </Link>
          )
        })}
        {!sectionsQuery.isLoading && !visible.length ? (
          <span className="text-sm text-[color:var(--bm-muted)]">Sections unavailable.</span>
        ) : null}
      </div>
    </section>
  )
}

function stripSectionPrefix(section: string, label: string) {
  const trimmed = label.trim()
  if (trimmed.toLowerCase().startsWith(`${section.toLowerCase()}:`)) {
    return trimmed.slice(section.length + 1).trim()
  }
  if (trimmed.toLowerCase().startsWith(`${section.toLowerCase()} `)) {
    return trimmed.slice(section.length + 1).trim()
  }
  return trimmed
}

function QuickQuery({ q }: { q: string }) {
  return (
    <Link
      to="/search"
      search={{ q }}
      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono text-[11px] text-[color:var(--bm-fg)] hover:bg-[color:var(--bm-bg)/0.55]"
    >
      {q}
    </Link>
  )
}
