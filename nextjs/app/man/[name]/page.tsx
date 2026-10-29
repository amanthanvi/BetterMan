import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { RunningHead } from '../../../components/man/RunningHead'
import { LinkPendingHint } from '../../../components/ui/LinkPendingHint'
import { canonicalWithDistro, withDistro } from '../../../lib/distro'
import { MISSING_MAN_METADATA, resolveManName } from '../../../lib/manLookup'
import { getPublicOrigin } from '../../../lib/public-origin'
import { explicitDistro, resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'
import { decodeManParam } from '../../../lib/shortUrl'

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name: rawName } = await params
  const name = decodeManParam(rawName)
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
  const { name: rawName } = await params
  const name = decodeManParam(rawName)
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

  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title={name.toUpperCase()} label="Choose a section" />
      <h1 className="mt-10 break-words font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">{name}</h1>
      <p className="mt-2.5 font-serif text-lg italic text-ink-2">More than one section has a page by this name.</p>

      <ul className="mt-8 font-serif text-md">
        {result.options.map((opt) => (
          <li key={opt.section} className="border-t border-rule py-2.5">
            <Link
              href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, urlDistro)}
              className="no-underline hover:text-accent"
            >
              <b className="font-semibold">{name}</b>({opt.section})
              <LinkPendingHint />
            </Link>{' '}
            <span className="text-ink-2">{opt.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
