import { api } from '../../convex/_generated/api'
import { getConvexClient } from './convexClient'
import { normalizeDistro, type Distro } from './distro'
import { translatedLang, type TranslatedLang } from './i18n/locales'

/**
 * The active dataset release per distro, as the proxy sees it. Man page HTML is
 * cached at the edge under a URL that carries this release, so a promotion
 * changes every cache key within RELEASE_TTL_MS, with no purge. Each server
 * instance asks Convex at most once per distro per TTL; a cached page view costs
 * nothing more.
 */
export type ReleaseInfo = {
  datasetReleaseId: string
  distro: Distro
  pageCount: number
  lastUpdated: string
}

export const RELEASE_TTL_MS = 60_000
/** Forwards the release the cache key used to the renderer, for its footer and data-cache keys. */
export const RELEASE_HEADER = 'x-bm-release'
export const UNKNOWN_RELEASE = 'unknown'
/**
 * Sent beside RELEASE_HEADER. The renderer trusts the release only with this
 * token, so a request that reached it some other way (a matcher gap, a direct
 * hit on the origin) cannot choose a cache key or the footer. The value is a
 * random secret inlined at build into server code only (next.config.ts).
 */
export const RELEASE_TOKEN_HEADER = 'x-bm-release-token'

export function releaseToken(): string {
  const token = process.env.BM_RELEASE_TOKEN
  if (!token) throw new Error('BM_RELEASE_TOKEN is not set')
  return token
}

/** The query parameter the proxy's rewrite adds; it exists only to key the CDN cache. */
export const RELEASE_PARAM = '__bm_release'

const releases = new Map<Distro, { at: number; value: Promise<ReleaseInfo | null> }>()

async function readRelease(distro: Distro): Promise<ReleaseInfo | null> {
  const info = await getConvexClient().query(api.queries.getInfo, { distro })
  if (info.datasetReleaseId === 'uninitialized') return null
  return { datasetReleaseId: info.datasetReleaseId, distro, pageCount: info.pageCount, lastUpdated: info.lastUpdated }
}

function cachedRelease(distro: Distro, now: number): Promise<ReleaseInfo | null> {
  const hit = releases.get(distro)
  if (hit && now - hit.at < RELEASE_TTL_MS) return hit.value
  // A failed read is kept for the same TTL: an outage must not turn every view into a Convex call.
  const value = readRelease(distro).catch(() => null)
  releases.set(distro, { at: now, value })
  return value
}

/** The release that serves `distro`: Debian's when the distro has none, since the pages fall back to Debian. */
export async function servingRelease(distro: Distro, now = Date.now()): Promise<ReleaseInfo | null> {
  const own = await cachedRelease(distro, now)
  if (own || distro === 'debian') return own
  return await cachedRelease('debian', now)
}

/**
 * A translated page (`?lang=`, #395) also depends on that language's release,
 * and falls back to English when the language lacks the page, so its cache key
 * carries both. `datasetReleaseId` is null when the distro has no release in
 * that language; `known` is false when the lookup failed or timed out.
 */
export type TranslationInfo = { lang: TranslatedLang; datasetReleaseId: string | null; known: boolean }

export const TRANSLATION_HEADER = 'x-bm-translation-release'

type Releases = { release: ReleaseInfo | null; translation: string | null }

const both = new Map<string, { at: number; value: Promise<Releases | undefined> }>()

async function readReleases(distro: Distro, lang: TranslatedLang): Promise<Releases> {
  // One query answers both: English, and the language's release (or null).
  const info = await getConvexClient().query(api.queries.getInfo, { distro, locale: lang })
  const release = info.datasetReleaseId === 'uninitialized'
    ? (distro === 'debian' ? null : await cachedRelease('debian', Date.now()))
    : { datasetReleaseId: info.datasetReleaseId, distro, pageCount: info.pageCount, lastUpdated: info.lastUpdated }
  return { release, translation: info.translation?.datasetReleaseId ?? null }
}

/**
 * `?lang=` (#395): the serving English release and the language's release for
 * `distro` in one Convex read, cached like servingRelease. Undefined when the
 * read failed: the page then renders unkeyed and makes no translation claim.
 */
export function servingReleases(distro: Distro, lang: TranslatedLang, now = Date.now()): Promise<Releases | undefined> {
  const key = `${distro}:${lang}`
  const hit = both.get(key)
  if (hit && now - hit.at < RELEASE_TTL_MS) return hit.value
  const value: Promise<Releases | undefined> = readReleases(distro, lang).catch(() => undefined)
  both.set(key, { at: now, value })
  return value
}

/** The part of the cache key a translation adds after the English release. */
export function translationKey(info: TranslationInfo): string {
  return `~${info.lang}:${info.known ? info.datasetReleaseId ?? 'none' : UNKNOWN_RELEASE}`
}

/** The translation the proxy forwarded beside a trusted release header; null without `?lang=` or trust. */
export function trustedTranslation(headers: Record<string, HeaderValue>): TranslationInfo | null {
  if (trustedProxyRelease(headers) === undefined) return null
  const raw = [headers[TRANSLATION_HEADER]].flat()[0]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TranslationInfo>
    const lang = translatedLang(parsed.lang)
    if (!lang || typeof parsed.known !== 'boolean') return null
    const id = typeof parsed.datasetReleaseId === 'string' && parsed.datasetReleaseId ? parsed.datasetReleaseId : null
    return { lang, datasetReleaseId: parsed.known ? id : null, known: parsed.known }
  } catch {
    return null
  }
}

export function encodeReleaseHeader(info: ReleaseInfo): string {
  return JSON.stringify(info)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Whether a request header carries this build's secret, which only the proxy knows. */
export function isProxyToken(token: string | null | undefined): boolean {
  return Boolean(token && process.env.BM_RELEASE_TOKEN && constantTimeEqual(token, process.env.BM_RELEASE_TOKEN))
}

type HeaderValue = string | string[] | undefined | null

/** Undefined means untrusted, null means the proxy could not resolve a release. */
export function trustedProxyRelease(headers: Record<string, HeaderValue>): ReleaseInfo | null | undefined {
  const token = [headers[RELEASE_TOKEN_HEADER]].flat()[0]
  if (!isProxyToken(token)) return undefined
  if (headers[RELEASE_HEADER] === UNKNOWN_RELEASE) return null
  return decodeReleaseHeader(headers[RELEASE_HEADER]) ?? undefined
}

/** The release the proxy forwarded, or null when unknown or untrusted. */
export function trustedRelease(headers: Record<string, HeaderValue>): ReleaseInfo | null {
  return trustedProxyRelease(headers) ?? null
}

/** Anything malformed reads as unknown. */
export function decodeReleaseHeader(value: HeaderValue): ReleaseInfo | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ReleaseInfo>
    const distro = normalizeDistro(parsed.distro)
    if (!distro || typeof parsed.datasetReleaseId !== 'string' || !parsed.datasetReleaseId) return null
    if (typeof parsed.pageCount !== 'number' || !Number.isFinite(parsed.pageCount) || typeof parsed.lastUpdated !== 'string') return null
    return { datasetReleaseId: parsed.datasetReleaseId, distro, pageCount: parsed.pageCount, lastUpdated: parsed.lastUpdated }
  } catch {
    return null
  }
}

/** Test seam: forget cached releases. */
export function resetReleaseCache() {
  releases.clear()
  both.clear()
}
