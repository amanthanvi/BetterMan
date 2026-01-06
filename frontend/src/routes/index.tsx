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
    <div className="mx-auto max-w-5xl py-14">
      <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
        <section>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
            Man pages,
            <span className="block text-[color:var(--bm-muted)]">but readable.</span>
          </h1>
          <p className="mt-4 max-w-[56ch] text-base text-[color:var(--bm-muted)]">
            BetterMan is a fast web UI for Linux man pages — with a stable URL scheme, a
            keyboard-first UX, and a “manual-like” reading layout.
          </p>

          <form
            className="mt-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault()
              const query = q.trim()
              if (!query) return
              navigate({ to: '/search', search: { q: query } })
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search (e.g. tar, ssh_config, curl)…"
                className="min-w-0 flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                aria-label="Search man pages"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-5 py-3 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
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
          </form>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Tip
              kbd="/"
              title="Search from anywhere"
              body="Press / to focus the global search input."
            />
            <Tip
              kbd="⌘K"
              title="Command palette"
              body="Jump to pages, sections, and actions."
            />
          </div>
        </section>

        <HomeSidebar />
      </div>
    </div>
  )
}

function HomeSidebar() {
  const infoQuery = useQuery({
    queryKey: queryKeys.info(),
    queryFn: () => fetchInfo(),
    staleTime: 5 * 60_000,
  })

  const sectionsQuery = useQuery({
    queryKey: ['sections'],
    queryFn: () => listSections(),
    staleTime: 60 * 60_000,
  })

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Current dataset</div>
        {infoQuery.isLoading ? (
          <div className="mt-2 text-sm text-[color:var(--bm-muted)]">Loading…</div>
        ) : infoQuery.data ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[color:var(--bm-muted)]">Release</div>
              <div className="font-mono text-[color:var(--bm-fg)]">{infoQuery.data.datasetReleaseId}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[color:var(--bm-muted)]">Pages</div>
              <div className="font-mono text-[color:var(--bm-fg)]">{infoQuery.data.pageCount.toLocaleString()}</div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[color:var(--bm-muted)]">Updated</div>
              <div className="font-mono text-[color:var(--bm-fg)]">{formatRelativeTime(infoQuery.data.lastUpdated)}</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-[color:var(--bm-muted)]">Unavailable.</div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Browse</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sectionsQuery.data?.map((s) => (
            <Link
              key={s.section}
              to="/section/$section"
              params={{ section: s.section }}
              className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs hover:bg-[color:var(--bm-bg)/0.55]"
              title={s.label}
            >
              <span className="font-mono">{s.section}</span>{' '}
              <span className="text-[color:var(--bm-muted)]">{s.label}</span>
            </Link>
          ))}
          {!sectionsQuery.data?.length ? (
            <span className="text-sm text-[color:var(--bm-muted)]">Sections unavailable.</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm backdrop-blur">
        Deep link example:{' '}
        <Link to="/man/$name/$section" params={{ name: 'tar', section: '1' }} className="underline underline-offset-4">
          /man/tar/1
        </Link>
      </div>
    </aside>
  )
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

function Tip({ kbd, title, body }: { kbd: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.55] p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <div className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-2 py-1 font-mono text-[11px] text-[color:var(--bm-muted)]">
          {kbd}
        </div>
      </div>
      <div className="mt-2 text-sm text-[color:var(--bm-muted)]">{body}</div>
    </div>
  )
}
