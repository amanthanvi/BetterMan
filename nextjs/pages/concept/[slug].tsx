import type { GetServerSideProps } from 'next'

import { ConceptArticle, ConceptNotFound } from '../../components/concept/ConceptArticle'
import { missingManHead, type ManHeadData } from '../../components/man/ManHead'
import { firstQuery, ManScript, requestHeaders } from '../../components/man/ManPageFrame'
import { ManShell } from '../../components/man/ManShell'
import { conceptHref, conceptReportHref, getConcept, publishedConcepts, type Concept } from '../../lib/concepts'
import { normalizeDistro, type Distro } from '../../lib/distro'
import { englishI18n, manT } from '../../lib/i18n/page'
import { setManCache } from '../../lib/manCache'
import { hasBareRsc, isManQuery } from '../../lib/manQuery'
import { getPublicOrigin } from '../../lib/public-origin'

/**
 * A concept explainer (B8, #400), as plain server HTML like the man pages: no Next
 * runtime, the hashed boot script for theme and preferences, and the man page script
 * for the palette and keys. Its content changes only with a deployment, and the
 * response depends only on the URL (never a cookie), so the CDN may cache it.
 * Keep `unstable_runtimeJS: false`: the props carry the explainer, and hydrating
 * this page would ship it to the browser.
 */
// `runtime` is here for Next's PagesPageConfig type, which does not list unstable_runtimeJS.
export const config = { runtime: 'nodejs', unstable_runtimeJS: false }

/** One hour at the edge, a day stale; a deployment replaces the CDN cache anyway. */
const CONCEPT_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
const CONCEPT_MISS_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600'
/** Drafts render only on opted-in local or CI builds; never cache them anywhere. */
const PRIVATE = 'private, no-store'

type Props =
  | { kind: 'page'; head: ManHeadData; concept: Concept; urlDistro: Distro | null; published: string[]; reportHref: string }
  | { kind: 'miss'; head: ManHeadData; urlDistro: Distro | null }

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const concept = getConcept(String(params?.slug ?? ''))
  // The proxy redirects any query but one valid `?distro=` (lib/manQuery.ts); reached
  // some other way, the answer stays private rather than key the CDN apart.
  const offList = !isManQuery('/concept/_', query, ['slug']) || hasBareRsc(req.url, req.headers)
  if (!concept) {
    res.statusCode = 404
    setManCache(res, offList ? PRIVATE : CONCEPT_MISS_CACHE, { keyed: true })
    return { props: { kind: 'miss', head: missingManHead(manT(englishI18n())), urlDistro } }
  }
  const draft = concept.status !== 'approved'
  setManCache(res, draft || offList ? PRIVATE : CONCEPT_CACHE, { keyed: true })
  const origin = getPublicOrigin({ headers: requestHeaders(req.headers) })
  return {
    props: {
      kind: 'page',
      head: {
        title: `${concept.title} — BetterMan`,
        description: concept.summary,
        canonical: `${origin}${conceptHref(concept.slug)}`,
        ogImage: null,
        jsonLd: null,
        // A draft shows only on a build that opted in; it is never indexed.
        noindex: draft,
      },
      concept,
      urlDistro,
      published: publishedConcepts().map((c) => c.slug),
      reportHref: conceptReportHref(concept, origin),
    },
  }
}

export default function ConceptRoute(props: Props) {
  // English only (docs/i18n.md): the query allowlist keeps `['distro']` here, so `?lang=` 308s to the
  // bare URL; the proxy never sends a remembered language here, and the links into and out of this
  // page carry no `?lang=`. No release: this is not a man page, so no "pages · updated" line.
  const i18n = englishI18n()
  const t = manT(i18n)
  return (
    <>
      <ManShell urlDistro={props.urlDistro} release={null} i18n={i18n} t={t}>
        {props.kind === 'page' ? (
          <ConceptArticle concept={props.concept} urlDistro={props.urlDistro} published={props.published} reportHref={props.reportHref} t={t} />
        ) : (
          <ConceptNotFound urlDistro={props.urlDistro} t={t} />
        )}
      </ManShell>
      <ManScript i18n={i18n} />
    </>
  )
}
