import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useToc } from '../app/toc'
import { ApiHttpError, fetchManByName, fetchManByNameAndSection, fetchRelated } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { recordRecentPage } from '../lib/recent'
import { manByNameAndSectionRoute } from '../routes/man.$name.$section'
import { ManPageView } from './man/ManPageView'

export default function ManByNameAndSectionPage() {
  const { name, section } = manByNameAndSectionRoute.useParams()
  const nameNorm = name.toLowerCase()
  const { setItems } = useToc()

  const pageQuery = useQuery({
    queryKey: queryKeys.man(nameNorm, section),
    queryFn: () => fetchManByNameAndSection(nameNorm, section),
  })

  const alternativesQuery = useQuery({
    queryKey: ['manAlternatives', nameNorm],
    enabled: pageQuery.isError && pageQuery.error instanceof ApiHttpError && pageQuery.error.status === 404,
    queryFn: () => fetchManByName(nameNorm),
    retry: false,
  })

  const relatedQuery = useQuery({
    queryKey: queryKeys.related(nameNorm, section),
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
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (pageQuery.isError) {
    const alt = alternativesQuery.data
    return (
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
    )
  }

  if (!pageQuery.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const { page, content } = pageQuery.data

  return (
    <ManPageView
      key={page.id}
      page={page}
      content={content}
      relatedItems={relatedQuery.data?.items ?? []}
    />
  )
}
