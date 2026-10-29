import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { FastApiError, fetchPackage, withDistroFallback } from '../../../lib/api'
import { ManSectionLabel, RunningHead } from '../../../components/man/RunningHead'
import { canonicalWithDistro, DISTRO_LABEL, withDistro } from '../../../lib/distro'
import { getPublicOrigin } from '../../../lib/public-origin'
import { getFirst, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'

type PackagePageProps = {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: PackagePageProps): Promise<Metadata> {
  const { name } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const { data, distro } = await withDistroFallback(requestedDistro, (distro) => fetchPackage({ distro, name }))
    .catch((error: unknown) => {
      if (error instanceof FastApiError && error.status === 404) return { data: null, distro: requestedDistro }
      throw error
    })
  if (!data?.pages.length) return { title: 'Package not found — BetterMan', robots: { index: false, follow: false } }
  const origin = getPublicOrigin({ headers: await headers() })
  const canonical = `${origin}${canonicalWithDistro(`/pkg/${encodeURIComponent(data.name)}`, distro)}`
  return {
    title: `${data.name} package — BetterMan`,
    description: `Manual pages supplied by ${data.name}${data.version ? ` ${data.version}` : ''} on ${distro}.`,
    alternates: { canonical },
    ...(getFirst(sp.cursor) !== undefined ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { name } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const cursor = getFirst(sp.cursor)
  const { data, distro } = await withDistroFallback(requestedDistro, (distro) => fetchPackage({ distro, name, cursor })).catch((error: unknown) => {
    if (error instanceof FastApiError && error.status === 404) notFound()
    throw error
  })
  if (data.cursorReset) redirect(withDistro(`/pkg/${encodeURIComponent(data.name)}`, distro))
  if (!data.pages.length && !cursor) notFound()
  const next = new URLSearchParams({ distro, ...(data.nextCursor ? { cursor: data.nextCursor } : {}) })
  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title="Package" label={data.name} end={DISTRO_LABEL[distro]} />
      <header className="pt-9">
        <h1 className="font-mono text-2xl font-semibold md:text-3xl">{data.name}</h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          {DISTRO_LABEL[distro]} package
          {data.version ? (
            <>
              {' '}
              <span className="font-mono text-md not-italic">{data.version}</span>
            </>
          ) : null}
        </p>
      </header>
      <section aria-labelledby="pkg-pages" className="mt-10">
        <ManSectionLabel as="h2" id="pkg-pages">
          Manual pages in this package
        </ManSectionLabel>
        <ul className="mt-2 border-b border-rule font-serif text-[1.0625rem] leading-[1.5]">
          {data.pages.map((page) => (
            <li key={`${page.name}.${page.section}`} className="border-t border-rule py-2">
              <Link className="group no-underline" href={withDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)}>
                <span className="group-hover:text-accent">
                  <b className="font-semibold">{page.name}</b>({page.section})
                </span>
              </Link>
              {/* title is the citation itself (rmt(8)); the NAME line's description says what the page is. */}
              {page.description ? <span className="text-ink-2"> {page.description}</span> : null}
            </li>
          ))}
        </ul>
        {data.hasMore ? (
          <p className="mt-4 text-sm">
            <Link className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent" href={`/pkg/${encodeURIComponent(data.name)}?${next}`}>
              More pages
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  )
}
