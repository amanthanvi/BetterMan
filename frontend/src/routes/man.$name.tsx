import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { fetchManByName } from '../api/client'
import { rootRoute } from './__root'

export const manByNameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/man/$name',
  component: ManByNamePage,
})

function ManByNamePage() {
  const { name } = manByNameRoute.useParams()
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['manByName', name.toLowerCase()],
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
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Page not found.{' '}
        <Link to="/search" search={{ q: name }} className="underline underline-offset-4">
          Search for “{name}”
        </Link>
        .
      </div>
    )
  }

  if (query.data?.kind === 'page') {
    return null
  }

  const options = query.data?.options ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
        Multiple sections match this name. Pick one:
      </p>

      <ol className="mt-6 space-y-3">
        {options.map((opt) => (
          <li
            key={opt.section}
            className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4"
          >
            <Link
              to="/man/$name/$section"
              params={{ name, section: opt.section }}
              className="font-semibold tracking-tight"
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

