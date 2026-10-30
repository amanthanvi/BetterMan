import type { GetServerSideProps } from 'next'

import { MISSING_MAN_HEAD, type ManHeadData } from '../../../components/man/ManHead'
import { ManNotFound } from '../../../components/man/ManNotFound'
import { ManPageDocument } from '../../../components/man/ManPageDocument'
import { firstQuery, ManScript, requestHeaders } from '../../../components/man/ManPageFrame'
import { ManShell } from '../../../components/man/ManShell'
import type { SectionPage } from '../../../lib/api'
import { normalizeDistro, withDistro, type Distro } from '../../../lib/distro'
import type { ManPageResponse } from '../../../lib/docModel'
import { manCanonicalPath } from '../../../lib/manCanonical'
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
  portabilityMode: 'glyph' | 'text'
  portabilityToggleHref: string
}

type MissProps = { kind: 'miss'; head: ManHeadData; miss: ManMiss; release: ReleaseInfo | null }

type Props = PageProps | MissProps

function pageHead(data: ManPageResponse, servedDistro: Distro, pkg: string | null, origin: string): ManHeadData {
  const { page } = data
  const path = `/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`
  const title = `${page.name}(${page.section}) - BetterMan`
  const description = page.description || page.title || `${page.name}(${page.section}) man page.`
  const canonical = manCanonicalPath(data, servedDistro, pkg)
  const ogPath = canonical.replace(path, `${path}/og`)
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
    canonical: isIndexable(page) ? `${origin}${canonical}` : null,
    ogImage: { url: `${origin}${ogPath}`, ...OG_SIZE, alt: 'Man page' },
    jsonLd: { id: `bm-jsonld:${page.id}`, json },
    noindex: !isIndexable(page),
  }
}

/** This page's URL with the other portability mode, keeping its own `?distro=` and `?pkg=`. */
function portabilityToggle(name: string, section: string, query: Record<string, string | string[] | undefined>, mode: 'glyph' | 'text'): string {
  const params = new URLSearchParams()
  for (const key of ['distro', 'pkg']) {
    const value = firstQuery(query[key])
    if (value) params.set(key, value)
  }
  if (mode === 'glyph') params.set('portability', 'text')
  const search = params.toString()
  return `/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}${search ? `?${search}` : ''}#options-index`
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const name = String(params?.name ?? '')
  const section = String(params?.section ?? '')
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const distro = urlDistro ?? 'debian'
  const pkg = packageName(firstQuery(query.pkg)) ?? null
  const portabilityMode = firstQuery(query.portability) === 'text' ? 'text' : 'glyph'
  const release = trustedRelease(req.headers)
  const releaseKey = release?.datasetReleaseId
  const found = await lookupManPage({ name, section, distro, ...(pkg ? { pkg } : {}), ...(releaseKey ? { release: releaseKey } : {}) })

  // Shared under the proxy's release key only when that release answered: within the
  // proxy's TTL after a promotion (or a rollback) the two can differ, for misses and
  // aliases as well as pages.
  const keyed = Boolean(releaseKey) && found.servedRelease === releaseKey

  if (found.kind === 'miss') {
    const miss = await manMiss({ name, section, distro, urlDistro, headers: requestHeaders(req.headers), ...(releaseKey ? { release: releaseKey } : {}) })
    res.statusCode = 404
    setManCache(res, miss.limited ? MAN_PRIVATE_CACHE : MAN_MISS_CACHE, { keyed: keyed && miss.answeredByKey })
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
  setManCache(res, MAN_PAGE_CACHE, { keyed })
  if (!isIndexable(page)) res.setHeader('X-Robots-Tag', 'noindex')
  return {
    props: {
      kind: 'page',
      head: pageHead(found.data, found.distro, pkg, origin),
      data: found.data,
      related: found.related,
      servedDistro: found.distro,
      urlDistro,
      release,
      reportHref: reportProblemHref({ page, distro: found.distro, origin }),
      portabilityMode,
      portabilityToggleHref: portabilityToggle(name, section, query, portabilityMode),
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

  const { data, related, servedDistro, urlDistro, release, reportHref, portabilityMode, portabilityToggleHref } = props
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
          derived={data.derived}
          brief={data.brief}
          providers={data.providers}
          portabilityMode={portabilityMode}
          portabilityToggleHref={portabilityToggleHref}
          reportHref={reportHref}
        />
      </ManShell>
      <ManScript />
    </>
  )
}
