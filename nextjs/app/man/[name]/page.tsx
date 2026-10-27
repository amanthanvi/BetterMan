import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'
import { canonicalWithDistro, withDistro } from '../../../lib/distro'
import { MISSING_MAN_METADATA, resolveManName } from '../../../lib/manLookup'
import { getPublicOrigin } from '../../../lib/public-origin'
import { explicitDistro, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name } = await params
  const sp = await searchParams
  const resolved = await resolveManName(name, await resolveRequestDistro(sp))
  if (!resolved) return MISSING_MAN_METADATA
  const { distro, result } = resolved
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
  const resolved = await resolveManName(name, await resolveRequestDistro(sp))
  if (!resolved) notFound()
  const { result } = resolved
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
