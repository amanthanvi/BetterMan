import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

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
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Man pages, but sane.</h1>
      <p className="mt-3 text-base text-[color:var(--bm-muted)]">
        BetterMan is a fast, readable, keyboard-first web UI for Linux man pages.
      </p>

      <form
        className="mt-8 flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const query = q.trim()
          if (!query) return
          navigate({ to: '/search', search: { q: query } })
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search man pages (e.g. tar, ssh_config, curl)…"
          className="min-w-0 flex-1 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
          aria-label="Search man pages"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-[var(--bm-accent)] px-4 py-2 text-sm font-medium text-[var(--bm-accent-contrast)] hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[color:var(--bm-muted)]">
        <span>Or try:</span>
        <Link to="/search" search={{ q: 'tar' }} className="underline underline-offset-4">
          tar
        </Link>
        <Link to="/search" search={{ q: 'ssh_config' }} className="underline underline-offset-4">
          ssh_config
        </Link>
        <Link to="/search" search={{ q: 'curl' }} className="underline underline-offset-4">
          curl
        </Link>
      </div>
    </div>
  )
}
