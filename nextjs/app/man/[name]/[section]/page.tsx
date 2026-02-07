import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'

import { DocRenderer } from '../../../../components/doc/DocRenderer'
import { RecentPageRecorder } from '../../../../components/recent/RecentPageRecorder'
import { TocSync } from '../../../../components/toc/TocSync'
import { FastApiError, fetchManByName, fetchManByNameAndSection, fetchRelated, suggest } from '../../../../lib/api'
import { normalizeDistro } from '../../../../lib/distro'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function withDistro(path: string, distro: string): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
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

    return (
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="font-mono text-3xl font-semibold tracking-tight">
                {pageData.page.name}({pageData.page.section})
              </h1>
              <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
                {pageData.page.description || pageData.page.title}
              </p>
            </div>

            {pageData.page.title ? (
              <div className="text-xs text-[color:var(--bm-muted)]">{pageData.page.title}</div>
            ) : null}

            {pageData.variants.length ? (
              <div className="flex flex-wrap gap-2 text-xs text-[color:var(--bm-muted)]">
                <span className="font-mono">Variants:</span>
                {pageData.variants.map((v) => (
                  <span
                    key={v.distro}
                    className={`rounded-full border border-[var(--bm-border)] px-3 py-1 ${
                      v.distro === pageData.page.distro
                        ? 'bg-[color:var(--bm-accent)/0.14] text-[color:var(--bm-fg)]'
                        : 'bg-[color:var(--bm-bg)/0.35]'
                    }`}
                  >
                    {v.distro}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              <div className="space-y-4">
                {pageData.content.toc.length ? (
                  <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
                    <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">TOC</div>
                    <ol className="mt-3 space-y-2 text-sm">
                      {pageData.content.toc.slice(0, 24).map((t) => (
                        <li key={t.id} className="leading-5">
                          <a href={`#${t.id}`} className="text-[color:var(--bm-muted)] hover:text-[color:var(--bm-fg)]">
                            <span className="font-mono text-[11px] text-[color:var(--bm-muted)]">{t.level}</span>{' '}
                            {t.title}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {related?.items?.length ? (
                  <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
                    <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Related</div>
                    <ul className="mt-3 space-y-2 text-sm">
                      {related.items.slice(0, 12).map((r) => (
                        <li key={`${r.name}:${r.section}`} className="flex flex-col">
                          <Link
                            href={withDistro(`/man/${encodeURIComponent(r.name)}/${encodeURIComponent(r.section)}`, distro)}
                            className="font-mono text-sm font-semibold tracking-tight underline underline-offset-4"
                          >
                            {r.name}({r.section})
                          </Link>
                          <div className="text-xs text-[color:var(--bm-muted)]">{r.description}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <article className="min-w-0">
            <TocSync items={pageData.content.toc} />
            <RecentPageRecorder
              name={pageData.page.name}
              section={pageData.page.section}
              description={pageData.page.description || pageData.page.title}
            />
            <DocRenderer blocks={pageData.content.blocks} />
          </article>
        </div>
      </div>
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
