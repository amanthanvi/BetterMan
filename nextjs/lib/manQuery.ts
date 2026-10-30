import { normalizeDistro } from './distro'
import { LANGS } from './i18n/locales'
import { shareFlag } from './manShare'
import { packageName } from './packageName'

/**
 * The query parameters a man page URL may carry. The CDN keys man pages by the
 * whole URL (proxy.ts adds the release), so every other parameter, a repeated
 * one, an invalid value or another spelling of a valid one would be a separate
 * cache entry and a fresh render. The proxy redirects such a URL to the one it
 * means (`normalizeManQuery`), keeping the valid parameters. Extend this list,
 * and docs/runbooks/vercel-ops.md, when a new parameter changes the page.
 *
 * Values are checked here without data: a known distro, a well-formed package
 * name, `portability=text` (the glyphs are the default), a single option key,
 * a UI language. Whether the package provides the page and the option exists
 * is the renderer's to settle (pages/man/[name]/[section].tsx).
 */
export const MAN_QUERY = {
  distro: (value: string) => normalizeDistro(value) === value,
  pkg: (value: string) => packageName(value) === value,
  portability: (value: string) => value === 'text',
  flag: (value: string) => shareFlag(value) === value,
  // B9's language switch (#401); English is the bare URL, so `?lang=en` normalizes away. The list is lib/i18n/locales.ts's.
  lang: (value: string) => MAN_LANGUAGES.includes(value),
} as const satisfies Record<string, (value: string) => boolean>

export type ManQueryParam = keyof typeof MAN_QUERY

/** The languages a man page URL may name: every language but English, from the one list (lib/i18n/locales.ts). */
export const MAN_LANGUAGES: readonly string[] = LANGS.filter((lang) => lang !== 'en')

/**
 * The one spelling a valid value has, or null. A language is canonical in its own case (`pt-BR`), but a
 * reader or a link may write `DE` or `pt-br`: those mean the same page, so they redirect to the canonical
 * spelling like the App Router's `?lang=` does (docs/i18n.md). Every other parameter is exact.
 */
function canonicalValue(key: ManQueryParam, value: string): string | null {
  if (key === 'lang') return MAN_LANGUAGES.find((lang) => lang.toLowerCase() === value.toLowerCase()) ?? null
  return MAN_QUERY[key](value) ? value : null
}

/** Which parameters each kind of man page URL reads. */
export function manQueryParams(pathname: string): readonly ManQueryParam[] | null {
  if (/^\/man\/[^/]+\/[^/]+\.txt$/.test(pathname) || /^\/[^/]+\.txt$/.test(pathname)) return ['distro', 'pkg', 'lang']
  if (/^\/man\/[^/]+\/[^/]+\/og$/.test(pathname)) return ['distro', 'pkg', 'flag']
  if (/^\/man\/[^/]+\/[^/]+$/.test(pathname)) return ['distro', 'pkg', 'portability', 'flag', 'lang']
  if (/^\/man\/[^/]+$/.test(pathname)) return ['distro', 'pkg', 'lang']
  // Concept explainers (pages/concept) are cached the same way; only the reader's distro changes their links.
  if (/^\/concept\/[^/]+$/.test(pathname)) return ['distro']
  return null
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * The canonical query for a man page URL, or null when `search` already is it.
 * Keeps each allowed parameter's first valid value, in the order given, spelled
 * as encodeURIComponent spells it; drops everything else (`utm_*`, `_rsc`
 * without a client fetch, the proxy's own release key, empty pairs).
 */
export function normalizeManQuery(pathname: string, search: string): string | null {
  const allowed = manQueryParams(pathname)
  if (!allowed) return null
  const raw = search.startsWith('?') ? search.slice(1) : search
  const kept: string[] = []
  const seen = new Set<string>()
  for (const pair of raw.split('&')) {
    const at = pair.indexOf('=')
    const key = decode(at < 0 ? pair : pair.slice(0, at))
    const value = at < 0 ? null : decode(pair.slice(at + 1))
    if (key === null || value === null || seen.has(key) || !(allowed as readonly string[]).includes(key)) continue
    const canonicalised = canonicalValue(key as ManQueryParam, value)
    if (canonicalised === null) continue
    seen.add(key)
    kept.push(`${key}=${encodeURIComponent(canonicalised)}`)
  }
  const canonical = kept.length ? `?${kept.join('&')}` : ''
  return canonical === search ? null : canonical
}

/**
 * True when a renderer's parsed query holds only allowed parameters, once each, with
 * valid values. The proxy redirects anything else; a renderer reached any other way
 * answers privately rather than trust that. `own` names the route's path parameters
 * and the proxy's release key, which Next merges into the query.
 */
export function isManQuery(pathname: string, query: Record<string, string | string[] | undefined>, own: readonly string[]): boolean {
  const allowed = manQueryParams(pathname) ?? []
  return Object.entries(query).every(([key, value]) => {
    if (own.includes(key)) return true
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(key)) return false
    return MAN_QUERY[key as ManQueryParam](value)
  })
}

/**
 * True when a request arrived with Next's `_rsc` cache-busting parameter but no `rsc`
 * header: not a client fetch, so nothing Next will answer specially. Next strips `_rsc`
 * from the parsed query and from the proxy's URL, but a Pages Router renderer still
 * sees it in `req.url`, so such a request is answered privately rather than cached
 * under a URL the CDN may key apart.
 */
export function hasBareRsc(url: string | undefined, headers: Record<string, string | string[] | undefined>): boolean {
  if (!url || headers.rsc !== undefined) return false
  return new URL(url, 'http://localhost').searchParams.has('_rsc')
}
