import Link from 'next/link'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { FastApiError, fetchPackage, withDistroFallback } from '../../../lib/api'
import { ManSectionLabel, RunningHead } from '../../../components/man/RunningHead'
import { canonicalWithDistro, DISTRO_LABEL, withDistro } from '../../../lib/distro'
import { getPublicOrigin } from '../../../lib/public-origin'
import { localizedSeo } from '../../../lib/i18n/seo'
import { getI18n } from '../../../lib/i18n/server'
import { explicitLang, getFirst, resolveRequestDistro, resolveRequestLang, type SearchParams } from '../../../lib/requestContext'

type PackagePageProps = {
  params: Promise<{ name: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: PackagePageProps): Promise<Metadata> {
  const { name } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const { t, lang } = await getI18n(resolveRequestLang(sp))
  const { data, distro } = await withDistroFallback(requestedDistro, (distro) => fetchPackage({ distro, name }))
    .catch((error: unknown) => {
      if (error instanceof FastApiError && error.status === 404) return { data: null, distro: requestedDistro }
      throw error
    })
  if (!data?.pages.length) return { title: t('{title} — BetterMan', { title: t('Package not found') }), robots: { index: false, follow: false } }
  const origin = getPublicOrigin({ headers: await headers() })
  const canonical = `${origin}${canonicalWithDistro(`/pkg/${encodeURIComponent(data.name)}`, distro)}`
  return {
    title: t('{title} — BetterMan', { title: t('{name} package', { name: data.name }) }),
    description: t('Manual pages supplied by {name}{version} on {distro}.', { name: data.name, version: data.version ? ` ${data.version}` : '', distro }),
    alternates: { canonical },
    ...(getFirst(sp.cursor) !== undefined ? { robots: { index: false, follow: true } } : {}),
    // The canonical stays the English URL; another language's page is noindex.
    ...(lang === 'en' ? {} : localizedSeo(lang, canonical)),
  }
}

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { name } = await params
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)
  const { t } = await getI18n(resolveRequestLang(sp))
  const urlLang = explicitLang(sp)
  const cursor = getFirst(sp.cursor)
  const { data, distro } = await withDistroFallback(requestedDistro, (distro) => fetchPackage({ distro, name, cursor })).catch((error: unknown) => {
    if (error instanceof FastApiError && error.status === 404) notFound()
    throw error
  })
  if (data.cursorReset) redirect(withDistro(`/pkg/${encodeURIComponent(data.name)}`, distro, urlLang))
  if (!data.pages.length && !cursor) notFound()
  const next = new URLSearchParams({ distro, ...(data.nextCursor ? { cursor: data.nextCursor } : {}), ...(urlLang ? { lang: urlLang } : {}) })
  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title={t('Package')} label={data.name} end={DISTRO_LABEL[distro]} />
      <header className="pt-9">
        <h1 className="font-mono text-2xl font-semibold md:text-3xl">{data.name}</h1>
        <p className="mt-2.5 font-serif text-lg italic text-ink-2">
          {t('{distro} package', { distro: DISTRO_LABEL[distro] })}
          {data.version ? (
            <>
              {' '}
              <span className="font-mono text-md not-italic">{data.version}</span>
            </>
          ) : null}
        </p>
      </header>
      <section aria-labelledby="pkg-pages" className="mt-10">
        <ManSectionLabel as="h2" id="pkg-pages">
          {t('Manual pages in this package')}
        </ManSectionLabel>
        <ul className="mt-2 border-b border-rule font-serif text-[1.0625rem] leading-[1.5]">
          {data.pages.map((page) => (
            <li key={`${page.name}.${page.section}`} className="border-t border-rule py-2">
              <Link className="group no-underline" href={withDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro, urlLang)}>
                <span className="group-hover:text-accent">
                  <b className="font-semibold">{page.name}</b>({page.section})
                </span>
              </Link>
              {/* title is the citation itself (rmt(8)); the NAME line's description says what the page is. */}
              {page.description ? <span className="text-ink-2"> {page.description}</span> : null}
            </li>
          ))}
        </ul>
        {data.hasMore ? (
          <p className="mt-4 text-sm">
            <Link className="underline decoration-rule-2 underline-offset-[3px] hover:text-accent" href={`/pkg/${encodeURIComponent(data.name)}?${next}`}>
              {t('More pages')}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  )
}
