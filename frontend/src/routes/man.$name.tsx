import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'

import { useDistro } from '../app/distro'
import { fetchManByName } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { getCanonicalUrl } from '../lib/seo'
import { rootRoute } from './__root'

export const manByNameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/man/$name',
  component: ManByNamePage,
})

function ManByNamePage() {
  const { name } = manByNameRoute.useParams()
  const navigate = useNavigate()
  const distro = useDistro()
  const canonical = getCanonicalUrl()

  const query = useQuery({
    queryKey: queryKeys.manByName(distro.distro, name.toLowerCase()),
    queryFn: () => fetchManByName(name.toLowerCase()),
  })

  useEffect(() => {
    if (query.data?.kind !== 'page') return
    const page = query.data.data.page
    navigate({
      to: '/man/$name/$section',
      params: { name: page.name, section: page.section },
      replace: true,
    })
  }, [navigate, query.data])

  if (query.isLoading) {
    return (
      <>
        <Helmet>
          <title>Loading… — BetterMan</title>
          {canonical ? <link rel="canonical" href={canonical} /> : null}
        </Helmet>
        <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
      </>
    )
  }

  if (query.isError) {
    return (
      <>
        <Helmet>
          <title>{name} — Not found — BetterMan</title>
          <meta name="description" content={`We couldn’t find “${name}” in the current BetterMan dataset.`} />
          {canonical ? <link rel="canonical" href={canonical} /> : null}
        </Helmet>
        <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          Page not found.{' '}
          <Link to="/search" search={{ q: name }} className="underline underline-offset-4">
            Search for “{name}”
          </Link>
          .
        </div>
      </>
    )
  }

  if (query.data?.kind === 'page') {
    return null
  }

  const options = query.data?.options ?? []
  const title = `${name} — Choose section — BetterMan`
  const description = `Multiple man page sections match “${name}”. Choose a section to continue.`

  return (
    <div className="mx-auto max-w-5xl">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {canonical ? <link rel="canonical" href={canonical} /> : null}
      </Helmet>
      <h1 className="font-mono text-3xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
        Multiple sections match this name. Pick one:
      </p>

      <ol className="mt-6 space-y-3">
        {options.map((opt) => (
          <li
            key={opt.section}
            className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm"
          >
            <Link
              to="/man/$name/$section"
              params={{ name, section: opt.section }}
              className="font-mono text-base font-semibold tracking-tight"
            >
              {name}({opt.section})
            </Link>
            <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{opt.description}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}
