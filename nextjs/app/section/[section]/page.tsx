import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

import { listSection } from '../../../lib/api'
import { isDefaultDistro, normalizeDistro, withDistro } from '../../../lib/distro'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params
  const title = `Section ${section} — BetterMan`
  return {
    title,
    description: `Browse BetterMan man pages in section ${section}.`,
    openGraph: {
      title,
      description: `Browse BetterMan man pages in section ${section}.`,
      type: 'website',
    },
  }
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<SearchParams>
}) {
  const { section } = await params
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const data = await listSection({ distro, section, limit: 200, offset: 0 })

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Section <span className="font-mono">{data.section}</span>{' '}
          <span className="text-[color:var(--bm-muted)]">— {data.label}</span>
        </h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">{data.total.toLocaleString()} pages</p>
      </header>

      <form
        className="mt-6 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur"
        action="/search"
        method="get"
      >
        <input type="hidden" name="section" value={data.section} />
        {isDefaultDistro(distro) ? null : <input type="hidden" name="distro" value={distro} />}
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            placeholder="Search within section…"
            className="min-w-[16rem] flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Search within section"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-[var(--bm-accent)] px-6 py-3 text-sm font-semibold text-[var(--bm-accent-contrast)] hover:opacity-90"
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-8">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.results.map((r) => (
            <li
              key={`${r.name}:${r.section}`}
              className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm"
            >
              <Link
                href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, distro)}
                className="font-mono text-base font-semibold tracking-tight underline underline-offset-4"
              >
                {r.name}({r.section})
              </Link>
              <div className="mt-1 text-xs text-[color:var(--bm-muted)]">{r.description}</div>
            </li>
          ))}
        </ol>

        {data.total > data.results.length ? (
          <div className="mt-6 text-sm text-[color:var(--bm-muted)]">
            Showing first {data.results.length.toLocaleString()} results. Use search to find more.
          </div>
        ) : null}
      </div>
    </div>
  )
}
