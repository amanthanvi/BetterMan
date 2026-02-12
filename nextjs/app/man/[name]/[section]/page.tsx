import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'

import { ManPageView } from '../../../../components/man/ManPageView'
import { JsonLdHead } from '../../../../components/seo/JsonLdHead'
import { FastApiError, fetchManByName, fetchManByNameAndSection, fetchRelated, suggest } from '../../../../lib/api'
import { normalizeDistro, withDistro } from '../../../../lib/distro'
import { safeJsonLdStringify } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

async function getRequestOrigin(): Promise<string | null> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return null

  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; section: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name, section } = await params
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const origin = await getRequestOrigin()
  const canonicalPath = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, distro)
  const canonical = origin ? `${origin}${canonicalPath}` : undefined

  try {
    const data = await fetchManByNameAndSection({
      distro,
      name: name.toLowerCase(),
      section,
    })

    const title = `${data.page.name}(${data.page.section}) - BetterMan`
    const description = data.page.description || data.page.title || `${data.page.name}(${data.page.section}) man page.`

    return {
      title,
      description,
      alternates: canonical ? { canonical } : undefined,
      openGraph: {
        title,
        description,
        type: 'article',
        images: ['/og-image.png'],
      },
    }
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) {
      const title = `${name}(${section}) — Not found — BetterMan`
      const description = `We couldn’t find ${name}(${section}) in the current BetterMan dataset.`
      return {
        title,
        description,
        alternates: canonical ? { canonical } : undefined,
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
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  try {
    const pageData = await fetchManByNameAndSection({
      distro,
      name: name.toLowerCase(),
      section,
    })

    const related = await fetchRelated({
      distro,
      name: pageData.page.name,
      section: pageData.page.section,
    }).catch(() => null)

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
          content={pageData.content}
          variants={pageData.variants}
          relatedItems={related?.items ?? []}
        />
      </>
    )
  } catch (err) {
    if (!(err instanceof FastApiError) || err.status !== 404) {
      throw err
    }

    const [alternatives, suggestions] = await Promise.all([
      fetchManByName({ distro, name: name.toLowerCase() }).catch(() => null),
      suggest({ distro, name: name.toLowerCase() }).catch(() => null),
    ])

    return (
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[var(--bm-border)] pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
          <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
            We couldn&apos;t find{' '}
            <span className="font-mono">
              {name}({section})
            </span>{' '}
            in the current dataset.
          </p>
        </header>

        {alternatives?.kind === 'ambiguous' && alternatives.options.length ? (
          <div className="mt-6 space-y-2 text-sm text-[color:var(--bm-muted)]">
            <div>Available sections:</div>
            <ul className="flex flex-wrap gap-2">
              {alternatives.options.map((opt) => (
                <li key={opt.section}>
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, distro)}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-3 py-1 text-sm hover:bg-[color:var(--bm-bg)/0.6]"
                  >
                    {name}({opt.section})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : alternatives?.kind === 'page' ? (
          <div className="mt-6 text-sm text-[color:var(--bm-muted)]">
            Found{' '}
            <Link
              href={withDistro(
                `/man/${encodeURIComponent(alternatives.data.page.name)}/${encodeURIComponent(alternatives.data.page.section)}`,
                distro,
              )}
              className="underline underline-offset-4"
            >
              {alternatives.data.page.name}({alternatives.data.page.section})
            </Link>{' '}
            instead.
          </div>
        ) : null}

        {suggestions?.suggestions?.length ? (
          <div className="mt-6 space-y-2 text-sm text-[color:var(--bm-muted)]">
            <div>Did you mean:</div>
            <ul className="space-y-2">
              {suggestions.suggestions.map((s) => (
                <li key={`${s.name}:${s.section}`} className="flex flex-col">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(s.name)}/${encodeURIComponent(s.section)}`, distro)}
                    className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
                  >
                    {s.name}({s.section})
                  </Link>
                  {s.description ? <div className="text-xs text-[color:var(--bm-muted)]">{s.description}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          <Link
            href={withDistro(`/search?q=${encodeURIComponent(name)}`, distro)}
            className="text-sm underline underline-offset-4"
          >
            Search for “{name}”
          </Link>
          .
        </div>

        <div className="mt-10 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">
            {name}({section}) — Not found — BetterMan
          </span>
        </div>
      </div>
    )
  }
}
