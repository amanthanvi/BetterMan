import { publicLangs } from './gate'
import { DEFAULT_LANG, resolveLang, type Lang } from './locales'

/** The proxy sets this request header from the URL's `?lang=`; it is never read from the client. */
export const LANG_HEADER = 'x-bm-lang'

/** The language of a request that has no `searchParams` (the root layout, the not-found page). */
export function requestLangFromHeaders(headers: { get(name: string): string | null }, available: readonly Lang[] = publicLangs()): Lang {
  return resolveLang(headers.get(LANG_HEADER), available) ?? DEFAULT_LANG
}
