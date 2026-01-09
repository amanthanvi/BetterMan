import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'

import { useDistro } from '../app/distro'
import { useToc } from '../app/toc'
import { ApiHttpError, fetchManByName, fetchManByNameAndSection, fetchRelated } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { getCanonicalUrl, getCspNonce, safeJsonLdStringify } from '../lib/seo'
import { recordRecentPage } from '../lib/recent'
import { manByNameAndSectionRoute } from '../routes/man.$name.$section'
import { ManPageView } from './man/ManPageView'

export default function ManByNameAndSectionPage() {
  const { name, section } = manByNameAndSectionRoute.useParams()
  const nameNorm = name.toLowerCase()
  const distro = useDistro()
  const { setItems } = useToc()
  const canonical = getCanonicalUrl()
  const cspNonce = getCspNonce()

  const pageQuery = useQuery({
    queryKey: queryKeys.man(distro.distro, nameNorm, section),
    queryFn: () => fetchManByNameAndSection(nameNorm, section),
  })

  const alternativesQuery = useQuery({
    queryKey: queryKeys.manAlternatives(distro.distro, nameNorm),
    enabled: pageQuery.isError && pageQuery.error instanceof ApiHttpError && pageQuery.error.status === 404,
    queryFn: () => fetchManByName(nameNorm),
    retry: false,
  })

  const relatedQuery = useQuery({
    queryKey: queryKeys.related(distro.distro, nameNorm, section),
    queryFn: () => fetchRelated(nameNorm, section),
    enabled: pageQuery.isSuccess,
  })

  const tocItems = pageQuery.data?.content.toc
  const recentId = pageQuery.data?.page.id
  const recentName = pageQuery.data?.page.name
  const recentSection = pageQuery.data?.page.section
  const recentDescription = pageQuery.data?.page.description

  useEffect(() => {
    setItems(tocItems ?? [])
    return () => setItems([])
  }, [setItems, tocItems])

  useEffect(() => {
    if (!recentId || !recentName || !recentSection) return
    recordRecentPage({
      name: recentName,
      section: recentSection,
      description: recentDescription,
    })
  }, [recentDescription, recentId, recentName, recentSection])

  if (pageQuery.isLoading) {
    return (
      <>
        <Helmet>
          <title>Loading… — BetterMan</title>
          {canonical ? <link rel="canonical" href={canonical} /> : null}
        </Helmet>
        <ManPageSkeleton />
      </>
    )
  }

  if (pageQuery.isError) {
    const alt = alternativesQuery.data
    return (
      <>
        <Helmet>
          <title>{nameNorm}({section}) — Not found — BetterMan</title>
          <meta
            name="description"
            content={`We couldn’t find ${nameNorm}(${section}) in the current BetterMan dataset.`}
          />
          {canonical ? <link rel="canonical" href={canonical} /> : null}
        </Helmet>
        <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          <div className="font-medium text-[color:var(--bm-fg)]">Page not found.</div>
          {alternativesQuery.isLoading ? (
            <div className="mt-2">Looking for alternatives…</div>
          ) : alt?.kind === 'ambiguous' && alt.options.length ? (
            <div className="mt-2 space-y-2">
              <div>Available sections:</div>
              <ul className="flex flex-wrap gap-2">
                {alt.options.map((opt) => (
                  <li key={opt.section}>
                    <Link
                      to="/man/$name/$section"
                      params={{ name: nameNorm, section: opt.section }}
                      className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg)/0.4] px-3 py-1 text-sm hover:bg-[color:var(--bm-bg)/0.6]"
                    >
                      {nameNorm}({opt.section})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : alt?.kind === 'page' ? (
            <div className="mt-2">
              Found{' '}
              <Link
                to="/man/$name/$section"
                params={{ name: alt.data.page.name, section: alt.data.page.section }}
                className="underline underline-offset-4"
              >
                {alt.data.page.name}({alt.data.page.section})
              </Link>{' '}
              instead.
            </div>
          ) : null}
          <div className="mt-3">
            <Link to="/search" search={{ q: nameNorm }} className="underline underline-offset-4">
              Search for “{nameNorm}”
            </Link>
            .
          </div>
        </div>
      </>
    )
  }

  if (!pageQuery.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const { page, content, variants } = pageQuery.data
  const pageTitle = `${page.name}(${page.section}) - BetterMan`
  const pageDescription = page.description || page.title || `${page.name}(${page.section}) man page.`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${page.name}(${page.section}) - ${page.title}`,
    name: `${page.name}(${page.section})`,
    description: pageDescription,
    dateModified: page.datasetReleaseId.split('+')[0] ?? undefined,
    author: {
      '@type': 'Organization',
      name: `${page.sourcePackage || page.name} maintainers`,
    },
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        {canonical ? <link rel="canonical" href={canonical} /> : null}
        {cspNonce ? (
          <script nonce={cspNonce} type="application/ld+json">
            {safeJsonLdStringify(jsonLd)}
          </script>
        ) : null}
      </Helmet>
      <ManPageView
        key={page.id}
        page={page}
        content={content}
        variants={variants}
        relatedItems={relatedQuery.data?.items ?? []}
      />
    </>
  )
}

function ManPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
        <div className="animate-pulse space-y-5">
          <div className="space-y-3">
            <div className="h-10 w-[min(18rem,85%)] rounded-2xl bg-[color:var(--bm-border)/0.6]" />
            <div className="h-4 w-[min(56ch,95%)] rounded-full bg-[color:var(--bm-border)/0.45]" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="h-6 w-40 rounded-full bg-[color:var(--bm-border)/0.5]" />
            <div className="h-6 w-48 rounded-full bg-[color:var(--bm-border)/0.5]" />
          </div>

          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.25] p-4">
            <div className="h-3 w-20 rounded-full bg-[color:var(--bm-border)/0.55]" />
            <div className="mt-3 h-28 w-full rounded-xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65]" />
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
            <div className="space-y-4">
              <div className="h-44 animate-pulse rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] shadow-sm backdrop-blur" />
              <div className="h-60 animate-pulse rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] shadow-sm backdrop-blur" />
            </div>
          </div>
        </aside>

        <article className="min-w-0">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-52 rounded-full bg-[color:var(--bm-border)/0.55]" />
            <div className="h-4 w-[min(70ch,100%)] rounded-full bg-[color:var(--bm-border)/0.4]" />
            <div className="h-4 w-[min(64ch,92%)] rounded-full bg-[color:var(--bm-border)/0.4]" />
            <div className="h-4 w-[min(60ch,88%)] rounded-full bg-[color:var(--bm-border)/0.4]" />
            <div className="h-4 w-[min(66ch,94%)] rounded-full bg-[color:var(--bm-border)/0.4]" />
          </div>
        </article>
      </div>
    </div>
  )
}
