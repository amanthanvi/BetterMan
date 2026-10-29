import Link from 'next/link'

import { HomeDashboardClient } from './HomeDashboardClient'
import { fetchInfo, listSections, withDistroFallback } from '../../lib/api'
import { withDistro } from '../../lib/distro'
import { explicitDistro, resolveRequestDistro, type SearchParams } from '../../lib/requestContext'
import { sectionsLabel } from '../../lib/sectionsLabel'
import { ManSectionLabel } from '../../components/man/RunningHead'
import { Kbd } from '../../components/ui/Kbd'
import { LinkPendingHint } from '../../components/ui/LinkPendingHint'

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)

  const { data } = await withDistroFallback(requestedDistro, async (activeDistro) =>
    Promise.all([fetchInfo(activeDistro), listSections(activeDistro)]),
  )
  const urlDistro = explicitDistro(sp)
  const [info, sections] = data
  const visible = sections.filter((s) => /^\d+$/.test(s.section)).slice(0, 9)

  return (
    <div className="mx-auto max-w-[40rem] pt-[10vh] md:pt-[14vh]">
      <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] md:text-[3rem]">
        betterman<span className="font-normal text-ink-3 oldstyle-nums">(1)</span>
      </h1>
      <p className="mt-2.5 font-serif text-lg italic text-ink-2 md:text-[1.3125rem]">
        The Unix manual, typeset for the screen.
      </p>

      <form action="/search" method="get" role="search" aria-label="Search man pages" className="mt-10">
        <input
          name="q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Try tar, ssh_config or copy files"
          data-bm-home-search
          className="bm-field border-b-[1.5px] border-ink pt-2 focus-visible:border-accent pb-2.5 text-lg placeholder:font-serif placeholder:italic md:text-xl"
          aria-label="Search man pages"
        />
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
        <p className="mt-2.5 text-sm text-ink-3">
          A command, a flag, or words from what it does, across {info.pageCount.toLocaleString()} pages.{' '}
          <span className="bm-js whitespace-nowrap">
            <Kbd>/</Kbd> search · <Kbd>⌘K</Kbd> palette
          </span>
        </p>
      </form>

      <HomeDashboardClient />

      <section aria-label="Browse sections" className="mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <ManSectionLabel as="h2">Browse</ManSectionLabel>
          {visible.length ? <p className="text-xs text-ink-3">{sectionsLabel(visible.map((s) => s.section))}</p> : null}
        </div>
        <ul className="mt-1.5 grid gap-x-8 font-serif text-md sm:grid-cols-2">
          {visible.map((s) => (
            <li key={s.section} className="py-0.5">
              <Link
                href={withDistro(`/section/${encodeURIComponent(s.section)}`, urlDistro)}
                className="group no-underline"
                title={s.label}
              >
                <span className="inline-block min-w-5 text-ink-3 oldstyle-nums">{s.section}</span>{' '}
                <span className="group-hover:text-accent">{s.label}</span>
                <LinkPendingHint />
              </Link>
            </li>
          ))}
        </ul>
        {!visible.length ? <p className="mt-1.5 text-sm text-ink-3">Sections unavailable.</p> : null}
      </section>
    </div>
  )
}
