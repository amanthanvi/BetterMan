import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { FastApiError, fetchPackage, withDistroFallback } from '../../../lib/api'
import { canonicalWithDistro, withDistro } from '../../../lib/distro'
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
    <div className="mx-auto max-w-3xl">
      <h1 className="font-mono text-2xl font-semibold">{data.name}</h1>
      <p className="mt-2 text-sm text-ink-3">{distro}{data.version ? ` · ${data.version}` : ''}</p>
      <ul className="mt-6 space-y-3">
        {data.pages.map((page) => (
          <li key={`${page.name}.${page.section}`}>
            <Link className="font-mono underline underline-offset-4" href={withDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)}>
              {page.name}({page.section})
            </Link>
            <span className="ml-3 text-sm text-ink-3">{page.title}</span>
          </li>
        ))}
      </ul>
      {data.hasMore ? <Link className="mt-6 inline-block underline underline-offset-4" href={`/pkg/${encodeURIComponent(data.name)}?${next}`}>More pages</Link> : null}
    </div>
  )
}
