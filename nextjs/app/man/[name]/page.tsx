import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'
import { FastApiError, fetchManResolve, withDistroFallback, type ManResolveResult } from '../../../lib/api'
import { canonicalWithDistro, withDistro, type Distro } from '../../../lib/distro'
import { getPublicOrigin } from '../../../lib/public-origin'
import { explicitDistro, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'

// Runs before anything streams, so an unknown name is an HTTP 404 and a single
// match an HTTP redirect instead of a 200 that falls back on the client.
// cache() shares one lookup between generateMetadata and the page per request.
const resolveName = cache(async (name: string, requestedDistro: Distro): Promise<{ distro: Distro; result: ManResolveResult }> => {
  try {
    const { distro, data } = await withDistroFallback(requestedDistro, (distro) =>
      fetchManResolve({ distro, name: name.toLowerCase() }),
    )
    return { distro, result: data }
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) notFound()
    throw err
  }
})

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name } = await params
  const sp = await searchParams
  const { distro, result } = await resolveName(name, await resolveRequestDistro(sp))
  // A single match redirects, so only the section picker has metadata to send.
  if (result.kind !== 'ambiguous') return {}

  const origin = getPublicOrigin({ headers: await headers() })
  const canonical = `${origin}${canonicalWithDistro(`/man/${encodeURIComponent(name)}`, distro)}`
  const title = `${name} — Choose section — BetterMan`
  const description = `Multiple man page sections match “${name}”. Choose a section to continue.`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website' },
  }
}

export default async function ManByNamePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}) {
  const { name } = await params
  const sp = await searchParams
  const { result } = await resolveName(name, await resolveRequestDistro(sp))
  const urlDistro = explicitDistro(sp)
  if (result.kind !== 'ambiguous') {
    // 307, not 308: the target depends on the distro cookie and on which sections
    // the current release has, so browsers must not cache it.
    redirect(
      withDistro(`/man/${encodeURIComponent(result.name)}/${encodeURIComponent(result.section)}`, urlDistro),
    )
  }

  const title = `${name} — Choose section — BetterMan`
  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-edge pb-6">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-2 text-sm text-muted">
          Multiple sections match this name. Pick one:
        </p>
      </header>

      <ol className="mt-6 space-y-3">
        {result.options.map((opt) => (
          <li
            key={opt.section}
            className="border-b border-edge py-4 "
          >
            <Link
              href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, urlDistro)}
              className="font-mono text-base font-semibold tracking-tight underline underline-offset-4"
            >
              {name}({opt.section})
              <LinkPendingHint />
            </Link>
            <div className="mt-1 text-sm text-muted">{opt.description}</div>
          </li>
        ))}
      </ol>

      <div className="mt-10 text-xs text-muted">
        <span className="font-mono">{title}</span>
      </div>
    </div>
  )
}
