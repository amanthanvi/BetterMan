import Link from 'next/link'
import { cookies } from 'next/headers'

import { HomeDashboardClient } from './HomeDashboardClient'
import { fetchInfo, listSections, withDistroFallback } from '../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro, type Distro } from '../lib/distro'
import { ManSectionLabel, RunningHead } from '../components/man/RunningHead'
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
      <RunningHead title="BETTERMAN(1)" label="User Commands" />

      <section aria-label="Name" className="mt-10">
        <ManSectionLabel>NAME</ManSectionLabel>
        <h1 className="mt-2 pl-6 text-base font-normal text-fg sm:pl-8">
          betterman — fast, readable Unix manual pages
        </h1>
      </section>

      <section aria-label="Search" className="mt-10">
        <ManSectionLabel>SYNOPSIS</ManSectionLabel>
        <div className="pl-6 sm:pl-8">
          <form action="/search" method="get" role="search" aria-label="Search man pages" className="mt-3">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="shrink-0 font-mono text-xl font-bold leading-none text-accent">
                $
              </div>
              <input
                name="q"
                type="search"
                autoComplete="off"
                placeholder="search man pages…"
                data-bm-home-search
                className="h-12 min-w-0 flex-1 border-0 border-b border-edge bg-transparent px-1 font-mono text-sm text-fg transition-colors placeholder:text-muted hover:border-edge-strong"
                aria-label="Search man pages"
              />
              {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 pl-7 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <Kbd>/</Kbd>
                <span className="font-mono">search</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Kbd>⌘K</Kbd>
                <span className="font-mono">palette</span>
              </div>
              <span className="font-mono text-faint">
                {info.pageCount.toLocaleString()} pages · keyboard-first · no accounts
              </span>
            </div>
          </form>
        </div>
      </section>

      <HomeDashboardClient distro={distro} />

      <section aria-label="Browse sections" className="mt-10 mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <ManSectionLabel as="h2">BROWSE</ManSectionLabel>
          <div className="font-mono text-xs text-faint">Sections 1–9</div>
        </div>
        <div className="mt-3 grid gap-x-8 gap-y-1.5 pl-6 sm:grid-cols-2 sm:pl-8 lg:grid-cols-3">
          {visible.map((s) => (
            <Link
              key={s.section}
              href={withDistro(`/section/${encodeURIComponent(s.section)}`, distro)}
              className="group font-mono text-sm hover:no-underline"
              title={s.label}
            >
              <span className="text-accent">{s.section}</span>{' '}
              <span className="text-muted group-hover:text-fg group-hover:underline group-hover:underline-offset-4">
                {s.label}
              </span>
            </Link>
          ))}
          {!visible.length ? <span className="text-sm text-muted">Sections unavailable.</span> : null}
        </div>
      </section>
    </div>
  )
}
