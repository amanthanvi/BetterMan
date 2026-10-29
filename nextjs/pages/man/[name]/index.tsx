import type { GetServerSideProps } from 'next'

import { MISSING_MAN_HEAD, type ManHeadData } from '../../../components/man/ManHead'
import { ManNotFound } from '../../../components/man/ManNotFound'
import { firstQuery, ManScript, requestHeaders } from '../../../components/man/ManPageFrame'
import { ManShell } from '../../../components/man/ManShell'
import { RunningHead } from '../../../components/man/RunningHead'
import type { AmbiguousPageResponse } from '../../../lib/docModel'
import { canonicalWithDistro, normalizeDistro, withDistro, type Distro } from '../../../lib/distro'
import { MAN_MISS_CACHE, MAN_PAGE_CACHE, MAN_PRIVATE_CACHE, setManCache } from '../../../lib/manCache'
import { manMiss, resolveManName, type ManMiss } from '../../../lib/manLookup'
import { trustedRelease, type ReleaseInfo } from '../../../lib/manRelease'
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
}

type Props = PickerProps | { kind: 'miss'; head: ManHeadData; miss: ManMiss; release: ReleaseInfo | null }

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, req, res }) => {
  const name = String(params?.name ?? '')
  const urlDistro = normalizeDistro(firstQuery(query.distro))
  const distro = urlDistro ?? 'debian'
  const release = trustedRelease(req.headers)
  const releaseKey = release?.datasetReleaseId
  const resolved = await resolveManName(name, distro, releaseKey)
  // Shared under the proxy's release key only when that release answered (see pages/man/[name]/[section].tsx).
  const keyed = Boolean(releaseKey) && resolved.servedRelease === releaseKey
  if (!resolved.result) {
    const miss = await manMiss({ name, section: null, distro, urlDistro, headers: requestHeaders(req.headers), ...(releaseKey ? { release: releaseKey } : {}) })
    res.statusCode = 404
    setManCache(res, miss.limited ? MAN_PRIVATE_CACHE : MAN_MISS_CACHE, { keyed })
    return { props: { kind: 'miss', head: MISSING_MAN_HEAD, miss, release } }
  }

  const { result } = resolved
  if (result.kind !== 'ambiguous') {
    // 307, not 308: the target depends on which sections the current release has.
    let destination = withDistro(`/man/${encodeURIComponent(result.name)}/${encodeURIComponent(result.section)}`, urlDistro)
    const pkg = result.kind === 'alias' ? packageName(result.pkg) : undefined
    if (pkg) destination += `${destination.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(pkg)}`
    setManCache(res, MAN_PAGE_CACHE, { keyed })
    return { redirect: { destination, permanent: false } }
  }

  setManCache(res, MAN_PAGE_CACHE, { keyed })
  return {
    props: {
      kind: 'picker',
      head: {
        title: `${name} — Choose section — BetterMan`,
        description: `Multiple man page sections match “${name}”. Choose a section to continue.`,
        canonical: `${getPublicOrigin({ headers: requestHeaders(req.headers) })}${canonicalWithDistro(`/man/${encodeURIComponent(name)}`, resolved.distro)}`,
        ogImage: null,
        jsonLd: null,
        noindex: false,
      },
      name,
      options: result.options,
      urlDistro,
      release,
    },
  }
}

export default function ManNameRoute(props: Props) {
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

  const { name, options, urlDistro, release } = props
  return (
    <>
      <ManShell urlDistro={urlDistro} release={release}>
        <div className="mx-auto max-w-[46rem]">
          <RunningHead title={name.toUpperCase()} label="Choose a section" />
          <h1 className="mt-10 break-words font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">{name}</h1>
          <p className="mt-2.5 font-serif text-lg italic text-ink-2">More than one section has a page by this name.</p>

          <ul className="mt-8 font-serif text-md">
            {options.map((opt) => (
              <li key={opt.section} className="border-t border-rule py-2.5">
                <a href={withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(opt.section)}`, urlDistro)} className="no-underline hover:text-accent">
                  <b className="font-semibold">{name}</b>({opt.section})
                </a>{' '}
                <span className="text-ink-2">{opt.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </ManShell>
      <ManScript />
    </>
  )
}
