import type { GetServerSideProps } from 'next'

import { MISSING_MAN_HEAD, type ManHeadData } from '../../../components/man/ManHead'
import { ManNotFound } from '../../../components/man/ManNotFound'
import { ManPageDocument } from '../../../components/man/ManPageDocument'
import { firstQuery, ManScript, requestHeaders } from '../../../components/man/ManPageFrame'
import { ManShell } from '../../../components/man/ManShell'
import type { SectionPage } from '../../../lib/api'
import { canonicalWithDistro, normalizeDistro, withDistro, type Distro } from '../../../lib/distro'
import type { ManPage, ManPageResponse } from '../../../lib/docModel'
import { MAN_MISS_CACHE, MAN_PAGE_CACHE, MAN_PRIVATE_CACHE, setManCache } from '../../../lib/manCache'
import { lookupManPage, manMiss, type ManMiss } from '../../../lib/manLookup'
import { trustedRelease, type ReleaseInfo } from '../../../lib/manRelease'
import { isIndexable } from '../../../lib/manRobots'
import { OG_SIZE } from '../../../lib/og/size'
import { packageName } from '../../../lib/packageName'
import { getPublicOrigin } from '../../../lib/public-origin'
import { reportProblemHref } from '../../../lib/reportProblem'
import { safeJsonLdStringify } from '../../../lib/seo'

/**
 * The man page, as plain server HTML with one small static script and no Next
 * runtime (`unstable_runtimeJS: false`), so the CDN can cache it per dataset
 * release under a hash-only CSP (proxy.ts). The response depends only on the URL
 * and the active release: it never reads a cookie.
 */
// `runtime` is here for Next's PagesPageConfig type, which does not list unstable_runtimeJS.
export const config = { runtime: 'nodejs', unstable_runtimeJS: false }

type PageProps = {
  kind: 'page'
  head: ManHeadData
  data: ManPageResponse
  related: SectionPage[]
  servedDistro: Distro
  urlDistro: Distro | null
  release: ReleaseInfo | null
  reportHref: string
}

type MissProps = { kind: 'miss'; head: ManHeadData; miss: ManMiss; release: ReleaseInfo | null }

type Props = PageProps | MissProps

function pageHead(page: ManPage, servedDistro: Distro, pkg: string | null, origin: string): ManHeadData {
  const path = `/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`
  const title = `${page.name}(${page.section}) - BetterMan`
  const description = page.description || page.title || `${page.name}(${page.section}) man page.`
  const ogPath = `${canonicalWithDistro(`${path}/og`, servedDistro)}${pkg ? `${servedDistro === 'debian' ? '?' : '&'}pkg=${encodeURIComponent(pkg)}` : ''}`
  const json = safeJsonLdStringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${page.name}(${page.section}) - ${page.title}`,
    name: `${page.name}(${page.section})`,
    description,
    dateModified: page.datasetReleaseId.split('+')[0] ?? undefined,
    author: { '@type': 'Organization', name: `${page.sourcePackage || page.name} maintainers` },
  })
  return {
    title,
    description,
    canonical: `${origin}${canonicalWithDistro(path, servedDistro)}`,
    ogImage: { url: `${origin}${ogPath}`, ...OG_SIZE, alt: 'Man page' },
    jsonLd: { id: `bm-jsonld:${page.id}`, json },
    noindex: !isIndexable(page),
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const name = String(params?.name ?? '')
  const section = String(params?.section ?? '')
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const distro = urlDistro ?? 'debian'
  const pkg = packageName(firstQuery(query.pkg)) ?? null
  const release = trustedRelease(req.headers)
  const releaseKey = release?.datasetReleaseId
  const keyed = Boolean(release)

  const found = await lookupManPage({ name, section, distro, ...(pkg ? { pkg } : {}), ...(releaseKey ? { release: releaseKey } : {}) })

  if (!found) {
    const miss = await manMiss({ name, section, distro, urlDistro, headers: requestHeaders(req.headers), ...(releaseKey ? { release: releaseKey } : {}) })
    res.statusCode = 404
    setManCache(res, miss.limited ? MAN_PRIVATE_CACHE : MAN_MISS_CACHE, { keyed })
    return { props: { kind: 'miss', head: MISSING_MAN_HEAD, miss, release } }
  }

  if (found.kind === 'alias') {
    let destination = withDistro(`/man/${encodeURIComponent(found.name)}/${encodeURIComponent(found.section)}`, urlDistro)
    const targetPkg = packageName(found.pkg)
    if (targetPkg) destination += `${destination.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(targetPkg)}`
    setManCache(res, MAN_PAGE_CACHE, { keyed })
    // Browsers cache a 308, so only an explicit `?distro=` gets one; a bare URL
    // resolved the alias on Debian's current release, which can change.
    return { redirect: { destination, permanent: Boolean(urlDistro) } }
  }

  const origin = getPublicOrigin({ headers: requestHeaders(req.headers) })
  const { page } = found.data
  // Served from a release other than the key's (a promotion mid-flight, or a fallback distro's): do not share it.
  setManCache(res, MAN_PAGE_CACHE, { keyed: keyed && page.datasetReleaseId === releaseKey })
  return {
    props: {
      kind: 'page',
      head: pageHead(page, found.distro, pkg, origin),
      data: found.data,
      related: found.related,
      servedDistro: found.distro,
      urlDistro,
      release,
      reportHref: reportProblemHref({ page, distro: found.distro, origin }),
    },
  }
}

export default function ManPageRoute(props: Props) {
  if (props.kind === 'miss') {
    return (
      <>
        <ManShell urlDistro={props.miss.urlDistro} release={props.release}>
          <ManNotFound miss={props.miss} />
        </ManShell>
        <ManScript />
      </>
    )
  }

  const { data, related, servedDistro, urlDistro, release, reportHref } = props
  return (
    <>
      <ManShell urlDistro={urlDistro} release={release}>
        <ManPageDocument
          page={data.page}
          content={data.content}
          variants={data.variants}
          servedDistro={servedDistro}
          urlDistro={urlDistro}
          relatedItems={related}
          portability={data.derived ? { portability: data.derived.portability, stale: data.derived.stale } : undefined}
          derivedLinks={data.derived ? { referencedBy: data.derived.referencedBy, family: data.derived.family, package: data.derived.package } : undefined}
          reportHref={reportHref}
        />
      </ManShell>
      <ManScript />
    </>
  )
}
