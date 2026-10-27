import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense, cache } from 'react'

import { ManPageSkeleton } from '../../../../components/man/ManPageSkeleton'
import { ManPageView } from '../../../../components/man/ManPageView'
import { JsonLdHead } from '../../../../components/seo/JsonLdHead'
import {
  FastApiError,
  fetchManByNameAndSectionOrAlias,
  fetchManMetaByNameAndSection,
  fetchRelated,
  withDistroFallback,
  type ManAlias,
} from '../../../../lib/api'
import type { ManPage } from '../../../../lib/docModel'
import { canonicalLinkDistro, normalizeDistro, withDistro, type Distro } from '../../../../lib/distro'
import { OG_SIZE } from '../../../../lib/og/card'
import { getPublicOrigin } from '../../../../lib/public-origin'
import { getFirst, resolveRequestDistro, type SearchParams } from '../../../../lib/requestContext'
import { safeJsonLdStringify } from '../../../../lib/seo'

type Lookup = { distro: Distro; name: string; section: string }
type Located = { distro: Distro; data: { kind: 'page'; page: ManPage } | ManAlias }

// Settles the status code before anything streams: page metadata proves a page
// exists, and a `.so` stub, which has no metadata row, loads its alias target.
// cache() shares one lookup between generateMetadata and the page per request.
const locate = cache(async (name: string, section: string, requestedDistro: Distro): Promise<Located> => {
  try {
    return await withDistroFallback(requestedDistro, async (distro) => {
      const opts = { distro, name: name.toLowerCase(), section }
      try {
        return { kind: 'page' as const, page: (await fetchManMetaByNameAndSection(opts)).page }
      } catch (err) {
        if (!(err instanceof FastApiError) || err.code !== 'PAGE_NOT_FOUND') throw err
      }
      const result = await fetchManByNameAndSectionOrAlias(opts)
      return result.kind === 'alias' ? result : { kind: 'page' as const, page: result.data.page }
    })
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) notFound()
    throw err
  }
})

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name, section } = await params
  const sp = await searchParams
  const { distro, data } = await locate(name, section, await resolveRequestDistro(sp))
  // An alias redirects, so there is no metadata to send.
  if (data.kind === 'alias') return {}

  const origin = getPublicOrigin({ headers: await headers() })
  const canonical = `${origin}${withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, canonicalLinkDistro(distro))}`
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
          url: `${origin}${withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}/og`, canonicalLinkDistro(distro))}`,
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
  const { name, section } = await params
  const sp = await searchParams
  const { distro, data } = await locate(name, section, await resolveRequestDistro(sp))
  if (data.kind === 'alias') {
    // Browsers cache a 308, so the target keeps exactly the request's `?distro=`
    // instead of one derived from the distro cookie.
    const target = `/man/${encodeURIComponent(data.name)}/${encodeURIComponent(data.section)}`
    const requested = normalizeDistro(getFirst(sp.distro))
    permanentRedirect(requested ? `${target}?distro=${requested}` : target)
  }

  const nonce = (await headers()).get('x-nonce') ?? undefined
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
      <Suspense fallback={<ManPageSkeleton />}>
        <ManPageBody distro={distro} name={name.toLowerCase()} section={section} />
      </Suspense>
    </>
  )
}

// The document streams in behind the skeleton once the status code is settled.
async function ManPageBody(opts: Lookup) {
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
      servedDistro={opts.distro}
      relatedItems={related.items}
    />
  )
}
