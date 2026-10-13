import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'

import { ServerDoc } from '../../../../components/doc/ServerDoc'
import { stripHeaderSections } from '../../../../components/man/stripHeaderSections'
import { ManPageView } from '../../../../components/man/ManPageView'
import { JsonLdHead } from '../../../../components/seo/JsonLdHead'
import {
  FastApiError,
  fetchManByName,
  fetchManByNameAndSectionOrAlias,
  fetchManMetaByNameAndSection,
  fetchRelated,
  isReleaseNotFoundError,
  suggest,
  withDistroFallback,
} from '../../../../lib/api'
import { withDistro } from '../../../../lib/distro'
import { getPublicOrigin } from '../../../../lib/public-origin'
import { resolveRequestDistro, type SearchParams } from '../../../../lib/requestContext'
import { safeJsonLdStringify } from '../../../../lib/seo'

export const revalidate = 3600

class AliasRedirect extends Error {}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name, section } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)

  const origin = getPublicOrigin({ headers: await headers() })

  try {
    const { distro, data } = await withDistroFallback(requestedDistro, (activeDistro) =>
      fetchManMetaByNameAndSection({
        distro: activeDistro,
        name: name.toLowerCase(),
        section,
      }),
    )
    const canonicalPath = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, distro)
    const canonical = `${origin}${canonicalPath}`

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
      },
    }
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) {
      const title = `${name}(${section}) — Not found — BetterMan`
      const description = `We couldn’t find ${name}(${section}) in the current BetterMan dataset.`
      const canonicalPath = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, requestedDistro)
      const canonical = `${origin}${canonicalPath}`

      return {
        title,
        description,
        alternates: { canonical },
        robots: { index: false },
      }
    }
    return { title: 'BetterMan' }
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
  const requestedDistro = await resolveRequestDistro(sp)
  let activeDistro = requestedDistro

  let aliasTarget: { name: string; section: string } | null = null
  try {
    // Fetch content and related links in parallel: related only needs the
    // (lowercased) URL name/section, not the resolved content payload.
    const { data: bundle } = await withDistroFallback(requestedDistro, async (candidateDistro) => {
      activeDistro = candidateDistro
      const [data, relatedItems] = await Promise.all([
        fetchManByNameAndSectionOrAlias({
          distro: candidateDistro,
          name: name.toLowerCase(),
          section,
        }),
        fetchRelated({
          distro: candidateDistro,
          name: name.toLowerCase(),
          section,
        }).catch(() => ({ items: [] })),
      ])
      return { data, related: relatedItems }
    })
    const resolved = bundle.data
    const related = bundle.related
    if (resolved.kind === 'alias') {
      aliasTarget = { name: resolved.name, section: resolved.section }
      throw new AliasRedirect()
    }
    const pageData = resolved.data

    const body = stripHeaderSections(pageData.content.blocks, pageData.content.toc ?? [], {
      hasSynopsis: Boolean(pageData.content.synopsis?.length),
    })
    const controls = {
      toc: body.toc,
      synopsis: pageData.content.synopsis,
      options: pageData.content.options,
      seeAlso: pageData.content.seeAlso,
    }

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
      <>
        <JsonLdHead
          id={`bm-jsonld:${pageData.page.id}`}
          nonce={nonce}
          jsonLd={jsonLd}
        />
        <ManPageView
          key={pageData.page.id}
          page={pageData.page}
          content={controls}
          variants={pageData.variants}
          relatedItems={related.items}
        >
          <ServerDoc blocks={body.blocks} distro={activeDistro} />
        </ManPageView>
      </>
    )
  } catch (err) {
    if (err instanceof AliasRedirect && aliasTarget) {
      permanentRedirect(
        withDistro(
          `/man/${encodeURIComponent(aliasTarget.name)}/${encodeURIComponent(aliasTarget.section)}`,
          activeDistro,
        ),
      )
    }
    if (!(err instanceof FastApiError) || err.status !== 404) {
      throw err
    }
    if (isReleaseNotFoundError(err)) {
      notFound()
    }

    const [alternatives, suggestions] = await Promise.all([
      fetchManByName({ distro: activeDistro, name: name.toLowerCase() }).catch(() => null),
      suggest({ distro: activeDistro, name: name.toLowerCase() }).catch(() => null),
    ])

    return (
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-edge pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
          <p className="mt-2 text-sm text-muted">
            We couldn&apos;t find{' '}
            <span className="font-mono">
              {name}({section})
            </span>{' '}
            in the current dataset.
          </p>
        </header>

        {alternatives?.kind === 'ambiguous' && alternatives.options.length ? (
          <div className="mt-6 space-y-2 text-sm text-muted">
            <div>Available sections:</div>
            <ul className="flex flex-wrap gap-2">
              {alternatives.options.map((opt) => (
                <li key={opt.section}>
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, activeDistro)}
                    className="font-mono text-sm underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-accent"
                  >
                    {name}({opt.section})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : alternatives?.kind === 'page' ? (
          <div className="mt-6 text-sm text-muted">
            Found{' '}
            <Link
              href={withDistro(
                `/man/${encodeURIComponent(alternatives.data.page.name)}/${encodeURIComponent(alternatives.data.page.section)}`,
                activeDistro,
              )}
              className="underline underline-offset-4"
            >
              {alternatives.data.page.name}({alternatives.data.page.section})
            </Link>{' '}
            instead.
          </div>
        ) : null}

        {suggestions?.suggestions?.length ? (
          <div className="mt-6 space-y-2 text-sm text-muted">
            <div>Did you mean:</div>
            <ul className="space-y-2">
              {suggestions.suggestions.map((s) => (
                <li key={`${s.name}:${s.section}`} className="flex flex-col">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(s.name)}/${encodeURIComponent(s.section)}`, activeDistro)}
                    className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
                  >
                    {s.name}({s.section})
                  </Link>
                  {s.description ? <div className="text-xs text-muted">{s.description}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          <Link
            href={withDistro(`/search?q=${encodeURIComponent(name)}`, activeDistro)}
            className="text-sm underline underline-offset-4"
          >
            Search for “{name}”
          </Link>
          .
        </div>

        <div className="mt-10 text-xs text-muted">
          <span className="font-mono">
            {name}({section}) — Not found — BetterMan
          </span>
        </div>
      </div>
    )
  }
}
