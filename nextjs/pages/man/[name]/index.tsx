import type { GetServerSideProps } from 'next'

import { missingManHead, type ManHeadData } from '../../../components/man/ManHead'
import { ManNotFound } from '../../../components/man/ManNotFound'
import { currentHref, firstQuery, ManScript, requestHeaders } from '../../../components/man/ManPageFrame'
import { ManShell } from '../../../components/man/ManShell'
import { RunningHead } from '../../../components/man/RunningHead'
import type { AmbiguousPageResponse } from '../../../lib/docModel'
import { canonicalWithDistro, normalizeDistro, withDistro, type Distro } from '../../../lib/distro'
import { manI18n, manT, type ManI18n } from '../../../lib/i18n/page'
import { withLang } from '../../../lib/i18n/locales'
import { MAN_MISS_CACHE, MAN_PAGE_CACHE, MAN_PRIVATE_CACHE, setManCache } from '../../../lib/manCache'
import { manMiss, resolveManName, type ManMiss } from '../../../lib/manLookup'
import { hasBareRsc, isManQuery } from '../../../lib/manQuery'
import { RELEASE_PARAM, trustedRelease, type ReleaseInfo } from '../../../lib/manRelease'
import { packageName } from '../../../lib/packageName'
import { getPublicOrigin } from '../../../lib/public-origin'

/** `/man/<name>`: the only section's page, or a picker when several sections have the name. Plain HTML, as pages/man/[name]/[section]. */
// `runtime` is here for Next's PagesPageConfig type, which does not list unstable_runtimeJS.
export const config = { runtime: 'nodejs', unstable_runtimeJS: false }

type PickerProps = {
  kind: 'picker'
  head: ManHeadData
  name: string
  options: AmbiguousPageResponse['options']
  urlDistro: Distro | null
  release: ReleaseInfo | null
  pkg: string | null
  i18n: ManI18n
}

type Props = PickerProps | { kind: 'miss'; head: ManHeadData; miss: ManMiss; release: ReleaseInfo | null; i18n: ManI18n }

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const name = String(params?.name ?? '')
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const distro = urlDistro ?? 'debian'
  const selectedPackage = packageName(firstQuery(query.pkg))
  // Anything the proxy would have redirected (lib/manQuery.ts) is answered privately.
  const unproven = Boolean(firstQuery(query.pkg)) || !isManQuery('/man/_', query, ['name', RELEASE_PARAM]) || hasBareRsc(req.url, req.headers)
  const i18n = await manI18n(query.lang, currentHref(`/man/${encodeURIComponent(name)}`, query, ['distro', 'pkg']))
  const { urlLang } = i18n
  const t = manT(i18n)
  const release = trustedRelease(req.headers)
  const releaseKey = release?.datasetReleaseId
  const resolved = await resolveManName(name, distro, releaseKey)
  // Shared under the proxy's release key only when that release answered (see pages/man/[name]/[section].tsx).
  const keyed = Boolean(releaseKey) && resolved.servedRelease === releaseKey
  if (!resolved.result) {
    const miss = await manMiss({ name, section: null, distro, urlDistro, headers: requestHeaders(req.headers), ...(releaseKey ? { release: releaseKey } : {}) })
    res.statusCode = 404
    setManCache(res, miss.limited || unproven ? MAN_PRIVATE_CACHE : MAN_MISS_CACHE, { keyed: keyed && miss.answeredByKey })
    return { props: { kind: 'miss', head: missingManHead(t), miss, release, i18n } }
  }

  const { result } = resolved
  if (result.kind !== 'ambiguous') {
    // 307, not 308: the target depends on which sections the current release has.
    let destination = withDistro(`/man/${encodeURIComponent(result.name)}/${encodeURIComponent(result.section)}`, urlDistro, urlLang)
    const pkg = result.kind === 'alias' ? packageName(result.pkg) : selectedPackage
    if (pkg) destination += `${destination.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(pkg)}`
    // A requested package is proven only by the page it leads to, so its answer stays private.
    setManCache(res, unproven ? MAN_PRIVATE_CACHE : MAN_PAGE_CACHE, { keyed })
    return { redirect: { destination, permanent: false } }
  }

  setManCache(res, unproven ? MAN_PRIVATE_CACHE : MAN_PAGE_CACHE, { keyed })
  return {
    props: {
      kind: 'picker',
      pkg: selectedPackage ?? null,
      head: {
        title: t('{name} — Choose section — BetterMan', { name }),
        description: t('Multiple man page sections match “{name}”. Choose a section to continue.', { name }),
        canonical: `${getPublicOrigin({ headers: requestHeaders(req.headers) })}${canonicalWithDistro(`/man/${encodeURIComponent(name)}`, resolved.distro)}`,
        ogImage: null,
        jsonLd: null,
        // A localized-UI picker canonicalizes to the English one and is not indexed (docs/i18n.md).
        noindex: urlLang !== null && urlLang !== 'en',
      },
      name,
      options: result.options,
      urlDistro,
      release,
      i18n,
    },
  }
}

export default function ManNameRoute(props: Props) {
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

  const { name, options, urlDistro, release, pkg, i18n } = props
  return (
    <>
      <ManShell urlDistro={urlDistro} release={release} i18n={i18n} t={t}>
        <div className="mx-auto max-w-[46rem]">
          <RunningHead title={name.toUpperCase()} label={t('Choose a section')} />
          <h1 className="mt-10 break-words font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">{name}</h1>
          <p className="mt-2.5 font-serif text-lg italic text-ink-2">{t('More than one section has a page by this name.')}</p>

          <ul className="mt-8 font-serif text-md">
            {options.map((opt) => (
              <li key={opt.section} className="border-t border-rule py-2.5">
                <a href={withLang(`${withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, urlDistro)}${pkg ? `${urlDistro ? '&' : '?'}pkg=${encodeURIComponent(pkg)}` : ''}`, i18n.urlLang)} className="no-underline hover:text-accent">
                  <b className="font-semibold">{name}</b>({opt.section})
                </a>{' '}
                <span className="text-ink-2">{opt.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </ManShell>
      <ManScript i18n={i18n} />
    </>
  )
}
