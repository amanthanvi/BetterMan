import { cookies, headers } from 'next/headers'

import { FastApiError, fetchManByNameAndSection } from '../../../../lib/api'
import { normalizeDistro } from '../../../../lib/distro'
import { safeJsonLdStringify } from '../../../../lib/seo'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function Head({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}) {
  const { name, section } = await params
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  try {
    const pageData = await fetchManByNameAndSection({
      distro,
      name: name.toLowerCase(),
      section,
    })

    const nonce = (await headers()).get('x-nonce') ?? undefined
    const jsonLd = safeJsonLdStringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: `${pageData.page.name}(${pageData.page.section}) - ${pageData.page.title}`,
      name: `${pageData.page.name}(${pageData.page.section})`,
      description:
        pageData.page.description ||
        pageData.page.title ||
        `${pageData.page.name}(${pageData.page.section}) man page.`,
      dateModified: pageData.page.datasetReleaseId.split('+')[0] ?? undefined,
      author: {
        '@type': 'Organization',
        name: `${pageData.page.sourcePackage || pageData.page.name} maintainers`,
      },
    })

    return (
      <script
        id={`bm-jsonld:${pageData.page.id}`}
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    )
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return null
    throw err
  }
}

