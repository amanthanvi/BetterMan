import type { ManKey } from '../lib/i18n/catalog/en/man'
import { fill, plural, source, type PlainKey, type PluralKey, type Translations } from '../lib/i18n/lite'
import type { Lang } from '../lib/i18n/locales'
import type { T } from '../lib/i18n/translate'

/**
 * The script's strings. English is the message itself, written where it is used, as it always was:
 * the English bundle erases the wrapper and carries no dictionary (scripts/man-i18n.mjs). Another
 * language is a bundle of its own that embeds that language's strings, already expanded by the
 * server's build, and a page loads only its own. Both constants are injected by the build; without
 * them (unit tests) the script reads as English.
 */
declare const __BM_DICT__: Translations | null
declare const __BM_LANG__: Lang

// Read at each use, so the English build folds them to nothing: no dictionary, no plural code.
export const pageLang = (): Lang => (typeof __BM_LANG__ === 'undefined' ? 'en' : __BM_LANG__)

export const t: T<PlainKey<ManKey>> = Object.assign(
  (key: string, vars?: Record<string, string | number>) => {
    const found = (typeof __BM_DICT__ === 'undefined' ? null : __BM_DICT__)?.[key]
    return fill(typeof found === 'string' ? found : source(key), vars)
  },
  { lang: pageLang() },
)

/** A message with a plural; English is the caller's own text. */
export function tn(key: PluralKey<ManKey>, n: number, english: string): string {
  const found = (typeof __BM_DICT__ === 'undefined' ? null : __BM_DICT__)?.[key]
  return typeof found === 'object' ? plural(found, n, pageLang()) : english
}

/** The URL's own `?lang=`, which links the script builds carry. */
export function urlLang(): Lang | null {
  return new URLSearchParams(window.location.search).get('lang') as Lang | null
}
