import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { FastApiError, fetchManByName, suggest } from '../../../lib/api'
import { normalizeDistro } from '../../../lib/distro'

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
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { name } = await params
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const origin = await getRequestOrigin()
  const canonicalPath = withDistro(`/man/${encodeURIComponent(name)}`, distro)
  const canonical = origin ? `${origin}${canonicalPath}` : undefined

  try {
    const result = await fetchManByName({ distro, name: name.toLowerCase() })
    if (result.kind === 'page') {
      const title = `${result.data.page.name}(${result.data.page.section}) - BetterMan`
      const description =
        result.data.page.description ||
        result.data.page.title ||
        `${result.data.page.name}(${result.data.page.section}) man page.`
      return {
        title,
        description,
        alternates: canonical ? { canonical } : undefined,
        openGraph: { title, description, type: 'article' },
      }
    }

    const title = `${name} — Choose section — BetterMan`
    const description = `Multiple man page sections match “${name}”. Choose a section to continue.`
    return {
      title,
      description,
      alternates: canonical ? { canonical } : undefined,
      openGraph: { title, description, type: 'website' },
    }
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) {
      const title = `${name} — Not found — BetterMan`
      const description = `We couldn’t find “${name}” in the current BetterMan dataset.`
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

export default async function ManByNamePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}) {
  const { name } = await params
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  try {
    const result = await fetchManByName({ distro, name: name.toLowerCase() })
    if (result.kind === 'page') {
      redirect(
        withDistro(
          `/man/${encodeURIComponent(result.data.page.name)}/${encodeURIComponent(result.data.page.section)}`,
          distro,
        ),
      )
    }

    const title = `${name} — Choose section — BetterMan`
    return (
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[var(--bm-border)] pb-6">
          <h1 className="font-mono text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
            Multiple sections match this name. Pick one:
          </p>
        </header>

        <ol className="mt-6 space-y-3">
          {result.options.map((opt) => (
            <li
              key={opt.section}
              className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm"
            >
              <Link
                href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, distro)}
                className="font-mono text-base font-semibold tracking-tight underline underline-offset-4"
              >
                {name}({opt.section})
              </Link>
              <div className="mt-1 text-sm text-[color:var(--bm-muted)]">{opt.description}</div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-xs text-[color:var(--bm-muted)]">
          <span className="font-mono">{title}</span>
        </div>
      </div>
    )
  } catch (err) {
    if (!(err instanceof FastApiError) || err.status !== 404) {
      throw err
    }

    const suggestions = await suggest({ distro, name: name.toLowerCase() }).catch(() => null)

    return (
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[var(--bm-border)] pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
          <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
            We couldn&apos;t find <span className="font-mono">{name}</span> in the current dataset.
          </p>
        </header>

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
          <span className="font-mono">{name} — Not found — BetterMan</span>
        </div>
      </div>
    )
  }
}
