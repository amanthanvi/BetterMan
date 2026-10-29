import { packageName } from '@/lib/packageName'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { ManPageView } from '../../../../components/man/ManPageView'
import { JsonLdHead } from '../../../../components/seo/JsonLdHead'
import { fetchManByNameAndSectionOrAlias, fetchRelated } from '../../../../lib/api'
import { canonicalWithDistro, withDistro, type Distro } from '../../../../lib/distro'
import { locateManPage, MISSING_MAN_METADATA } from '../../../../lib/manLookup'
import { OG_SIZE } from '../../../../lib/og/card'
import { getPublicOrigin } from '../../../../lib/public-origin'
import { reportProblemHref } from '../../../../lib/reportProblem'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../../../lib/requestContext'
import { decodeManParam } from '../../../../lib/shortUrl'
import { safeJsonLdStringify } from '../../../../lib/seo'

type Lookup = { distro: Distro; name: string; section: string; pkg?: string }

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name: rawName, section: rawSection } = await params
  const name = decodeManParam(rawName)
  const section = decodeManParam(rawSection)
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const pkg = packageName(getFirst(sp.pkg))
  const located = pkg ? await locateManPage(name, section, requestedDistro, pkg) : await locateManPage(name, section, requestedDistro)
  if (!located) return MISSING_MAN_METADATA
  const { distro, data } = located
  // An alias redirects, so there is no metadata to send.
  if (data.kind === 'alias') return {}

  const origin = getPublicOrigin({ headers: await headers() })
  const canonical = `${origin}${canonicalWithDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, distro)}`
  const title = `${data.page.name}(${data.page.section}) - BetterMan`
  const description = data.page.description || data.page.title || `${data.page.name}(${data.page.section}) man page.`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'article',
      images: [
        {
          url: `${origin}${canonicalWithDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}/og`, distro)}${pkg ? `${distro === 'debian' ? '?' : '&'}pkg=${encodeURIComponent(pkg)}` : ''}`,
          ...OG_SIZE,
          alt: 'Man page',
          type: 'image/png',
        },
      ],
    },
  }
}

export default async function ManByNameAndSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}) {
  const { name: rawName, section: rawSection } = await params
  const name = decodeManParam(rawName)
  const section = decodeManParam(rawSection)
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const pkg = packageName(getFirst(sp.pkg))
  const located = pkg ? await locateManPage(name, section, requestedDistro, pkg) : await locateManPage(name, section, requestedDistro)
  if (!located) notFound()
  const { distro, data } = located
  if (data.kind === 'alias') {
    const urlDistro = explicitDistro(sp)
    let target = withDistro(`/man/${encodeURIComponent(data.name)}/${encodeURIComponent(data.section)}`, urlDistro)
    if (packageName(data.pkg)) target += `${target.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(data.pkg!)}`
    // Browsers cache a 308, so only an explicit `?distro=` gets one; a bare URL
    // resolved the alias on the stored default, which can change.
    if (urlDistro) permanentRedirect(target)
    redirect(target)
  }

  const requestHeaders = await headers()
  const nonce = requestHeaders.get('x-nonce') ?? undefined
  const origin = getPublicOrigin({ headers: requestHeaders })
  const jsonLd = safeJsonLdStringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${data.page.name}(${data.page.section}) - ${data.page.title}`,
    name: `${data.page.name}(${data.page.section})`,
    description: data.page.description || data.page.title || `${data.page.name}(${data.page.section}) man page.`,
    dateModified: data.page.datasetReleaseId.split('+')[0] ?? undefined,
    author: {
      '@type': 'Organization',
      name: `${data.page.sourcePackage || data.page.name} maintainers`,
    },
  })

  return (
    <>
      <JsonLdHead id={`bm-jsonld:${data.page.id}`} nonce={nonce} jsonLd={jsonLd} />
      {await ManPageBody({ distro, name, section, ...(packageName(getFirst(sp.pkg)) ? { pkg: packageName(getFirst(sp.pkg)) } : {}) }, origin)}
    </>
  )
}

// Await the document before returning the page: a painted shell delays React's reveal by 300 ms.
async function ManPageBody(opts: Lookup, origin: string) {
  const [result, related] = await Promise.all([
    fetchManByNameAndSectionOrAlias(opts),
    fetchRelated(opts).catch(() => ({ items: [] })),
  ])
  // locate() saw a page, so an alias here means the release changed mid-request.
  if (result.kind === 'alias') notFound()

  const pageData = result.data
  return (
    <ManPageView
      key={pageData.page.id}
      page={pageData.page}
      content={pageData.content}
      variants={pageData.variants}
      portability={pageData.derived ? { portability: pageData.derived.portability, stale: pageData.derived.stale } : undefined}
      derivedLinks={pageData.derived ? { referencedBy: pageData.derived.referencedBy, family: pageData.derived.family, package: pageData.derived.package } : undefined}
      servedDistro={opts.distro}
      relatedItems={related.items}
      reportHref={reportProblemHref({ page: pageData.page, distro: opts.distro, origin })}
    />
  )
}
