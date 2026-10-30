import { isProxyToken, RELEASE_TOKEN_HEADER } from '../manRelease'
import { publicLangs } from './gate'
import { DEFAULT_LANG, resolveLang, type Lang } from './locales'

/**
 * The proxy sets this request header from the URL's `?lang=`, beside the build's secret (RELEASE_TOKEN_HEADER).
 * The proxy does not run for prefetches, which would let a client choose the language of a response, so the
 * header counts only with the secret.
 */
export const LANG_HEADER = 'x-bm-lang'

/** The language of a request that has no `searchParams` (the root layout, the not-found page). */
export function requestLangFromHeaders(headers: { get(name: string): string | null }, available: readonly Lang[] = publicLangs()): Lang {
  if (!isProxyToken(headers.get(RELEASE_TOKEN_HEADER))) return DEFAULT_LANG
  return resolveLang(headers.get(LANG_HEADER), available) ?? DEFAULT_LANG
}
