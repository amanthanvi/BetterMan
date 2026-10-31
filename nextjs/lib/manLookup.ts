import {
  FastApiError,
  fetchManByNameAndSectionOrAlias,
  fetchManDistros,
  fetchManResolve,
  fetchRelated,
  fetchTranslatedMan,
  translationAnsweredBy,
  suggest,
  withDistroFallback,
  answeredBy,
  servedRelease,
  type ManAlias,
  type ManResolveResult,
  type RelatedResponse,
  type Suggestion,
} from './api'
import type { Distro } from './distro'
import type { ManPageResponse } from './docModel'
import type { TranslatedLang } from './i18n/locales'
import type { TranslationInfo } from './manRelease'
import { isRateLimited } from './rateLimit'
import { isManName } from './shortUrl'

/**
 * Lookups for the man page renderer (pages/man). They read no cookies and no
 * request state beyond their arguments, so a response depends only on its URL
 * and the active release, and the CDN can cache it.
 */

/**
 * Every outcome names the release that answered it (`servedRelease`), so a
 * route can share it under the proxy's release key only when the two agree.
 */
type Served = { servedRelease: string | null }
/**
 * With `?lang=` (#395): the language's own page (with the route's languages and
 * whether English has it, for hreflang and the English link), or English
 * because the language confirmed it lacks the route.
 */
export type TranslationOutcome =
  | { lang: TranslatedLang; state: 'translated'; englishHasRoute: boolean; englishIndexable: boolean; languages: string[] }
  /** `noRelease`: BetterMan has no release in the language for this distro, which says nothing about the distro. */
  | { lang: TranslatedLang; state: 'missing'; noRelease: boolean }
export type ManPageLookup =
  | ({ kind: 'page'; distro: Distro; data: ManPageResponse; related: RelatedResponse['items']; translation?: TranslationOutcome } & Served)
  | ({ distro: Distro; lang?: TranslatedLang } & ManAlias & Served)
  | ({ kind: 'miss' } & Served)

type Missing = { missing: true; servedRelease: string | null }

async function orMissing<T>(lookup: Promise<T>): Promise<T | Missing> {
  try {
    return await lookup
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return { missing: true, servedRelease: err.datasetReleaseId ?? null }
    throw err
  }
}

function isMissing(value: unknown): value is Missing {
  return Boolean(value && typeof value === 'object' && (value as Missing).missing === true)
}

/**
 * With `?lang=` (#395), the language's own page or `.so` alias first, for the
 * URL's distro only. When the language lacks the route, English answers with
 * `translation.state = 'missing'`. A translated answer is shared under the
 * proxy's key only when the key's translated release gave it; the route still
 * compares `servedRelease` with the English key, which the cache key also holds.
 */
export async function lookupManPage(opts: {
  name: string
  section: string
  distro: Distro
  pkg?: string
  release?: string
  translation?: TranslationInfo | null
}): Promise<ManPageLookup> {
  const { translation } = opts
  if (!translation || opts.pkg) return await lookupEnglishPage(opts)
  const english = opts.release ?? null
  const { name, section } = opts
  const lang = translation.lang
  // One read answers both cases. Without a known key, or on an error, English
  // renders privately and claims nothing about the language.
  const result = english && translation.known
    ? await fetchTranslatedMan({ distro: opts.distro, name, section, lang, english, translated: translation.datasetReleaseId }).catch(() => null)
    : null
  if (!result) {
    const fallback = await lookupEnglishPage(opts)
    return { ...fallback, servedRelease: null }
  }
  const keyed = translationAnsweredBy(result, english, translation.datasetReleaseId)
  const served = keyed ? english : null
  if (result.kind === 'not_found') return { kind: 'miss', servedRelease: served }
  if (result.kind === 'alias') return { ...result, distro: opts.distro, lang, servedRelease: served }
  const pageRelease = servedRelease(result)
  const related = await fetchRelated({ distro: opts.distro, name, section, lang, ...(pageRelease ? { release: pageRelease } : {}) })
    .catch((): RelatedResponse => ({ items: [] }))
  const answer = result.translation
  return {
    kind: 'page', distro: opts.distro, data: result.data, related: related.items,
    translation: answer.state === 'translated'
      ? { lang, state: 'translated', englishHasRoute: answer.englishHasRoute === true, englishIndexable: answer.englishIndexable === true, languages: answer.languages ?? [lang] }
      : { lang, state: 'missing', noRelease: answer.translatedReleaseId === null },
    servedRelease: keyed && servedRelease(related) === pageRelease ? served : null,
  }
}

/** A page, the alias target when the URL is a `.so` stub, or a miss. */
async function lookupEnglishPage(opts: {
  name: string
  section: string
  distro: Distro
  pkg?: string
  release?: string
}): Promise<ManPageLookup> {
  const { name, section, pkg, release } = opts
  const relatedFor = (distro: Distro): Promise<RelatedResponse> =>
    fetchRelated({ distro, name, section, ...(release ? { release } : {}) }).catch((err: unknown) => ({
      items: [],
      ...(err instanceof FastApiError && err.datasetReleaseId ? { datasetReleaseId: err.datasetReleaseId } : {}),
    }))
  // Related reads run beside the document, for the requested distro; a fallback to Debian reads them again.
  const related = pkg ? null : relatedFor(opts.distro)
  const found = await orMissing(
    withDistroFallback(opts.distro, (distro) =>
      fetchManByNameAndSectionOrAlias({ distro, name, section, ...(pkg ? { pkg } : {}), ...(release ? { release } : {}) }),
    ),
  )
  if (isMissing(found)) return { kind: 'miss', servedRelease: found.servedRelease }
  if (found.data.kind === 'alias') return { ...found.data, distro: found.distro, servedRelease: servedRelease(found.data) }
  const relatedResult = await (found.distro === opts.distro && related ? related : relatedFor(found.distro))
  const pageRelease = servedRelease(found.data)
  // The page is one answer only when its related links come from the same release; otherwise
  // it names no single release, so the route does not share it under any key.
  const consistent = pageRelease !== null && servedRelease(relatedResult) === pageRelease
  return { kind: 'page', distro: found.distro, data: found.data.data, related: relatedResult.items, servedRelease: consistent ? pageRelease : null }
}

export type ResolvedManName = ({ distro: Distro; result: ManResolveResult } | { result: null }) & Served

/** A name's only section, alias target or section picker; `result: null` for a miss. */
export async function resolveManName(name: string, distro: Distro, release?: string, translation?: TranslationInfo | null): Promise<ResolvedManName> {
  // `?lang=` (#395) resolves in the language first, then English. Its answer
  // counts as the key's when either key release gave it; without a known key it is private.
  const lang = translation?.known && release ? { lang: translation.lang, translated: translation.datasetReleaseId } : undefined
  const resolved = await orMissing(
    withDistroFallback(distro, (activeDistro) =>
      fetchManResolve({ distro: activeDistro, name: name.toLowerCase(), ...(release ? { release } : {}), ...(lang ? { lang } : {}) }),
    ),
  )
  const served = (value: string | null) =>
    !translation ? value : lang && value !== null && (value === release || value === lang.translated) ? release ?? null : null
  if (isMissing(resolved)) return { result: null, servedRelease: served(resolved.servedRelease) }
  return { distro: resolved.distro, result: resolved.data, servedRelease: served(servedRelease(resolved.data)) }
}

export type ManMiss = {
  name: string
  section: string | null
  /** The distro the page is missing from. */
  distro: Distro
  urlDistro: Distro | null
  suggestions: Suggestion[]
  /** Distros that have the page, or the name in any section. */
  distros: Distro[]
  /** True when the typo reads were skipped for the search rate limit: the response must not be shared. */
  limited: boolean
  /** False when a suggestion or distro read came from another release than the key's: do not share it. */
  answeredByKey: boolean
}

/** What a miss offers: nearby names and the distros that have the page. */
export async function manMiss(opts: {
  name: string
  section: string | null
  distro: Distro
  urlDistro: Distro | null
  headers: Headers
  release?: string
}): Promise<ManMiss> {
  const { name, section, distro, urlDistro, release } = opts
  const miss: ManMiss = { name, section, distro, urlDistro, suggestions: [], distros: [], limited: false, answeredByKey: true }
  if (!isManName(name)) return miss
  // The typo read costs up to 64 documents, so it shares the search limit.
  if (await isRateLimited(opts.headers, 'search')) return { ...miss, limited: true }
  const lower = name.toLowerCase()
  const [suggested, available] = await Promise.all([
    withDistroFallback(distro, (activeDistro) =>
      suggest({ distro: activeDistro, name: lower, typos: true, ...(release ? { release } : {}) }),
    ).catch(() => null),
    fetchManDistros({ name: lower, section, ...(release ? { release } : {}) }).catch(() => null),
  ])
  // A failed read adds nothing to the page, so only a read that answered from another release counts against it.
  const answeredByKey = (!suggested || answeredBy(suggested.data, release)) && (!available || answeredBy(available, release))
  return { ...miss, suggestions: suggested?.data.suggestions ?? [], distros: available?.distros ?? [], answeredByKey }
}
