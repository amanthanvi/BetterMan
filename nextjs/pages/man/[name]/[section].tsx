import type { GetServerSideProps } from 'next'

import { missingManHead, type ManHeadData } from '../../../components/man/ManHead'
import { ManNotFound } from '../../../components/man/ManNotFound'
import { ManPageDocument } from '../../../components/man/ManPageDocument'
import { currentHref, firstQuery, ManScript, requestHeaders } from '../../../components/man/ManPageFrame'
import { ManShell } from '../../../components/man/ManShell'
import { sectionLabel } from '../../../components/man/RunningHead'
import type { SectionPage } from '../../../lib/api'
import { DISTRO_LABEL, normalizeDistro, withDistro, type Distro } from '../../../lib/distro'
import type { ManPageResponse } from '../../../lib/docModel'
import { manI18n, manT, type ManI18n } from '../../../lib/i18n/page'
import type { ServerT } from '../../../lib/i18n/server'
import { manCanonicalPath } from '../../../lib/manCanonical'
import { hasBareRsc, isManQuery } from '../../../lib/manQuery'
import { manOption, shareFlag, withShareFlag } from '../../../lib/manShare'
import { MAN_MISS_CACHE, MAN_PAGE_CACHE, MAN_PENDING_CACHE, MAN_PRIVATE_CACHE, setManCache } from '../../../lib/manCache'
import { LANGS, setLang } from '../../../lib/i18n/locales'
import { lookupManPage, manMiss, type ManMiss, type TranslationOutcome } from '../../../lib/manLookup'
import { RELEASE_PARAM, trustedRelease, trustedTranslation, type ReleaseInfo } from '../../../lib/manRelease'
import { isIndexable } from '../../../lib/manRobots'
import { truncateOgText } from '../../../lib/og/input'
import { OG_SIZE } from '../../../lib/og/size'
import { packageName } from '../../../lib/packageName'
import { getPublicOrigin } from '../../../lib/public-origin'
import { parseReleaseId, releaseDay } from '../../../lib/release'
import { reportProblemHref } from '../../../lib/reportProblem'
import { safeJsonLdStringify } from '../../../lib/seo'

/**
 * The man page, as plain server HTML with one small static script and no Next
 * runtime (`unstable_runtimeJS: false`), so the CDN can cache it per dataset
 * release under a hash-only CSP (proxy.ts). The response depends only on the URL
 * and the active release: it never reads a cookie.
 */
// `runtime` is here for Next's PagesPageConfig type, which does not list unstable_runtimeJS.
// Keep unstable_runtimeJS false: ManPageDocument imports the bundled concept explainers
// (lib/concepts.generated.json), which sit in this page's unused client chunk; hydrating
// the page would make every reader download them.
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
  i18n: ManI18n
  translation: TranslationOutcome | null
}

type MissProps = { kind: 'miss'; head: ManHeadData; miss: ManMiss; release: ReleaseInfo | null; i18n: ManI18n }

type Props = PageProps | MissProps

/** The printed running head and foot: TAR(1) · User Commands · TAR(1) over the text; edition, system and release day under it. */
function printParts(page: ManPageResponse['page'], servedDistro: Distro, release: ReleaseInfo | null, t: ServerT): NonNullable<ManHeadData['print']> {
  const title = `${page.name.toUpperCase()}(${page.section})`
  const edition = page.sourcePackage ? `${page.sourcePackage}${page.sourcePackageVersion ? ` ${page.sourcePackageVersion}` : ''}` : ''
  const day = releaseDay(parseReleaseId(page.datasetReleaseId).builtAt ?? (release?.datasetReleaseId === page.datasetReleaseId ? release.lastUpdated : null))
  return { head: [title, sectionLabel(page.section, t, servedDistro), title], foot: [edition, [DISTRO_LABEL[servedDistro], day].filter(Boolean).join(' · ')] }
}

function pageHead(data: ManPageResponse, servedDistro: Distro, pkg: string | null, origin: string, flag: string | null, release: ReleaseInfo | null, t: ServerT, localized: boolean, translation: TranslationOutcome | null): ManHeadData {
  const { page } = data
  const path = `/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`
  const citation = `${page.name}(${page.section})`
  const title = `${citation} — BetterMan`
  const description = page.description || page.title || t('{citation} man page.', { citation })
  const english = manCanonicalPath(data, servedDistro, pkg)
  // Localized URLs use only an indexable English original as their canonical.
  const canonicalIndexable = translation?.state === 'translated'
    ? translation.englishHasRoute && translation.englishIndexable
    : isIndexable(page)
  const ogPath = english.replace(path, `${path}/og`)
  // `?flag=` shares one option: its card and its definition, under the page's canonical URL.
  const option = flag ? manOption(data.content.options, flag) : null
  const share = option
    ? {
        title: `${page.name} ${flag} · ${citation} — BetterMan`,
        description: option.description ? truncateOgText(option.description, 300) : description,
        image: { url: `${origin}${withShareFlag(ogPath, flag!)}`, ...OG_SIZE, alt: `${option.flags} in ${citation}` },
      }
    : { title, description, image: { url: `${origin}${ogPath}`, ...OG_SIZE, alt: page.description ? `${citation}: ${page.description}` : citation } }
  const json = safeJsonLdStringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${citation} — ${page.title}`,
    name: citation,
    description,
    dateModified: page.datasetReleaseId.split('+')[0] ?? undefined,
    author: { '@type': 'Organization', name: `${page.sourcePackage || page.name} maintainers` },
  })
  return {
    title,
    description,
    canonical: canonicalIndexable ? `${origin}${english}` : null,
    ogImage: share.image,
    ...(option ? { share: { title: share.title, description: share.description } } : {}),
    jsonLd: { id: `bm-jsonld:${page.id}`, json },
    noindex: !isIndexable(page) || localized || translation !== null,
    print: printParts(page, servedDistro, release, t),
    ...(translation?.state === 'translated' ? { alternates: routeAlternates(origin, english, translation) } : {}),
  }
}

/**
 * A translated page's hreflang set (#395): every language with the route, the
 * same set its sitemap entry lists (lib/translationSitemap.ts). English and
 * x-default appear only when English has the page itself and is indexable.
 */
function routeAlternates(origin: string, english: string, translation: Extract<TranslationOutcome, { state: 'translated' }>) {
  const withEnglish = translation.englishHasRoute && translation.englishIndexable
  return [
    ...LANGS.filter((code) => code === 'en' && withEnglish)
      .map((code) => ({ hrefLang: code, href: `${origin}${setLang(english, code)}` })),
    ...(withEnglish ? [{ hrefLang: 'x-default', href: `${origin}${english}` }] : []),
  ]
}

/** This page's URL with only `keep` of its parameters, spelled as lib/manQuery.ts expects. */
function manPageUrl(name: string, section: string, query: Record<string, string | string[] | undefined>, keep: string[], extra = ''): string {
  const pairs = keep.flatMap((key) => {
    const value = firstQuery(query[key])
    return value ? [`${key}=${encodeURIComponent(value)}`] : []
  })
  if (extra) pairs.push(extra)
  return `/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}${pairs.length ? `?${pairs.join('&')}` : ''}`
}

/** This page's URL with the other portability mode, keeping its own `?distro=`, `?pkg=` and `?lang=`. */
function portabilityToggle(name: string, section: string, query: Record<string, string | string[] | undefined>, mode: 'glyph' | 'text'): string {
  return `${manPageUrl(name, section, query, ['distro', 'pkg', 'lang'], mode === 'glyph' ? 'portability=text' : '')}#options-index`
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const name = String(params?.name ?? '')
  const section = String(params?.section ?? '')
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const distro = urlDistro ?? 'debian'
  const pkg = packageName(firstQuery(query.pkg)) ?? null
  const portabilityMode = firstQuery(query.portability) === 'text' ? 'text' : 'glyph'
  const flag = shareFlag(firstQuery(query.flag))
  const i18n = await manI18n(query.lang, currentHref(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, query))
  const { urlLang } = i18n
  const release = trustedRelease(req.headers)
  const releaseKey = release?.datasetReleaseId
  const translationKey = trustedTranslation(req.headers)
  const found = await lookupManPage({ name, section, distro, ...(pkg ? { pkg } : {}), ...(releaseKey ? { release: releaseKey } : {}), ...(translationKey ? { translation: translationKey } : {}) })

  // Shared under the proxy's release key only when that release answered: within the
  // proxy's TTL after a promotion (or a rollback) the two can differ, for misses and
  // aliases as well as pages.
  const keyed = Boolean(releaseKey) && found.servedRelease === releaseKey
  // `?pkg=` and `?flag=` are well formed by now (proxy.ts, lib/manQuery.ts), but only a
  // page that has the package and the option makes them a variant worth sharing: any
  // other answer to them is private, so made-up values never fill the CDN.
  const offList = !isManQuery('/man/_/_', query, ['name', 'section', RELEASE_PARAM]) || hasBareRsc(req.url, req.headers)
  const unproven = Boolean(firstQuery(query.pkg) || firstQuery(query.flag)) || offList

  if (found.kind === 'miss') {
    const miss: ManMiss = pkg ? { name, section, distro, urlDistro, suggestions: [], distros: [], limited: false, answeredByKey: false } : await manMiss({ name, section, distro, urlDistro, headers: requestHeaders(req.headers), ...(releaseKey ? { release: releaseKey } : {}) })
    res.statusCode = 404
    setManCache(res, miss.limited || unproven ? MAN_PRIVATE_CACHE : MAN_MISS_CACHE, { keyed: keyed && miss.answeredByKey })
    return { props: { kind: 'miss', head: missingManHead(manT(i18n)), miss, release, i18n } }
  }

  if (found.kind === 'alias') {
    let destination = withDistro(`/man/${encodeURIComponent(found.name)}/${encodeURIComponent(found.section)}`, urlDistro, urlLang)
    const targetPkg = packageName(found.pkg)
    if (targetPkg) destination += `${destination.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(targetPkg)}`
    // A translated alias keeps its language even when the UI language is not public yet.
    if (found.lang) destination = setLang(destination, found.lang)
    setManCache(res, unproven ? MAN_PRIVATE_CACHE : MAN_PAGE_CACHE, { keyed })
    // Browsers cache a 308, so only an explicit `?distro=` gets one; a bare URL
    // resolved the alias on Debian's current release, which can change.
    return { redirect: { destination, permanent: Boolean(urlDistro) } }
  }

  // A flag this page does not define is dropped, privately: it depends on the release.
  if (firstQuery(query.flag) && !(flag && manOption(found.data.content.options, flag))) {
    setManCache(res, MAN_PRIVATE_CACHE, { keyed })
    return { redirect: { destination: manPageUrl(name, section, query, ['distro', 'pkg', 'portability', 'lang']), permanent: false } }
  }

  const origin = getPublicOrigin({ headers: requestHeaders(req.headers) })
  const { page } = found.data
  if (!isIndexable(page) || (urlLang !== null && urlLang !== 'en') || found.translation) res.setHeader('X-Robots-Tag', 'noindex')
  // A translated page's drift note may still be building for the current English release (#395).
  const pending = found.translation?.state === 'translated' && found.data.translationDriftPending === true
  setManCache(res, offList ? MAN_PRIVATE_CACHE : pending ? MAN_PENDING_CACHE : MAN_PAGE_CACHE, { keyed })
  return {
    props: {
      kind: 'page',
      head: pageHead(found.data, found.distro, pkg, origin, flag, release, manT(i18n), urlLang !== null && urlLang !== 'en', found.translation ?? null),
      data: found.data,
      related: found.related,
      servedDistro: found.distro,
      urlDistro,
      release,
      reportHref: reportProblemHref({ page, distro: found.distro, origin }),
      portabilityMode,
      portabilityToggleHref: portabilityToggle(name, section, query, portabilityMode),
      i18n,
      translation: found.translation ?? null,
    },
  }
}

export default function ManPageRoute(props: Props) {
  const t = manT(props.i18n)
  if (props.kind === 'miss') {
    return (
      <>
        <ManShell urlDistro={props.miss.urlDistro} release={props.release} i18n={props.i18n} t={t}>
          <ManNotFound miss={props.miss} urlLang={props.i18n.urlLang} t={t} />
        </ManShell>
        <ManScript i18n={props.i18n} />
      </>
    )
  }

  const { data, related, servedDistro, urlDistro, release, reportHref, portabilityMode, portabilityToggleHref, i18n, translation } = props
  return (
    <>
      <ManShell urlDistro={urlDistro} release={release} i18n={i18n} t={t}>
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
          urlLang={i18n.urlLang}
          t={t}
          translation={translation ?? undefined}
          drift={translation?.state === 'translated' ? data.translationDrift : undefined}
        />
      </ManShell>
      <ManScript i18n={i18n} />
    </>
  )
}
