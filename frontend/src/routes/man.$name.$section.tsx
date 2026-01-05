import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'

import { fetchManByNameAndSection, fetchRelated } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { DocRenderer } from '../man/DocRenderer'
import { OptionsTable } from '../man/OptionsTable'
import { Toc } from '../man/Toc'
import { rootRoute } from './__root'

export const manByNameAndSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/man/$name/$section',
  component: ManByNameAndSectionPage,
})

function ManByNameAndSectionPage() {
  const { name, section } = manByNameAndSectionRoute.useParams()
  const nameNorm = name.toLowerCase()

  const pageQuery = useQuery({
    queryKey: queryKeys.man(nameNorm, section),
    queryFn: () => fetchManByNameAndSection(nameNorm, section),
  })

  const relatedQuery = useQuery({
    queryKey: queryKeys.related(nameNorm, section),
    queryFn: () => fetchRelated(nameNorm, section),
    enabled: pageQuery.isSuccess,
  })

  if (pageQuery.isLoading) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (pageQuery.isError) {
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

  if (!pageQuery.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const { page, content } = pageQuery.data

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {page.name}({page.section})
        </h1>
        <p className="mt-2 text-base text-[color:var(--bm-muted)]">{page.description}</p>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color:var(--bm-muted)]">
          {page.sourcePackage ? (
            <div>
              Package: <span className="text-[color:var(--bm-fg)]">{page.sourcePackage}</span>
              {page.sourcePackageVersion ? (
                <span className="text-[color:var(--bm-muted)]"> {page.sourcePackageVersion}</span>
              ) : null}
            </div>
          ) : null}
          <div>
            Dataset: <span className="text-[color:var(--bm-fg)]">{page.datasetReleaseId}</span>
          </div>
        </div>

        {content.synopsis?.length ? (
          <div className="mt-5">
            <div className="text-xs font-medium uppercase tracking-wider text-[color:var(--bm-muted)]">
              Synopsis
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm leading-6">
              <code>{content.synopsis.join('\n')}</code>
            </pre>
          </div>
        ) : null}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <Toc items={content.toc} />
        </aside>

        <article>
          {content.options?.length ? (
            <section className="mb-10">
              <h2 className="text-sm font-semibold tracking-tight">Options</h2>
              <div className="mt-3">
                <OptionsTable options={content.options} />
              </div>
            </section>
          ) : null}

          <DocRenderer blocks={content.blocks} />
        </article>
      </div>

      {content.seeAlso?.length ? (
        <aside className="mt-10">
          <h2 className="text-sm font-semibold tracking-tight">See also</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {content.seeAlso.slice(0, 24).map((ref) => (
              <li key={`${ref.name}:${ref.section ?? ''}`}>
                {ref.section ? (
                  <Link
                    to="/man/$name/$section"
                    params={{ name: ref.name, section: ref.section }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
                  >
                    {ref.name}({ref.section})
                  </Link>
                ) : (
                  <Link
                    to="/man/$name"
                    params={{ name: ref.name }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
                  >
                    {ref.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {relatedQuery.data?.items?.length ? (
        <aside className="mt-10">
          <h2 className="text-sm font-semibold tracking-tight">Related</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {relatedQuery.data.items.slice(0, 12).map((item) => (
              <li key={`${item.name}:${item.section}`}>
                <Link
                  to="/man/$name/$section"
                  params={{ name: item.name, section: item.section }}
                  className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
                >
                  {item.name}({item.section})
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  )
}
