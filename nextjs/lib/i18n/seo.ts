import type { Metadata } from 'next'

import { DEFAULT_LANG, withLang, type Lang } from './locales'

/**
 * A localized UI URL is its own cacheable page, but until translated manual
 * content ships (B3, #395) its manual is the English one under translated
 * chrome. Search engines must not index that as a duplicate, so every page
 * rendered in another language is `noindex, follow` and names the English URL
 * as canonical. docs/i18n.md records the policy.
 */
export function localizedSeo(lang: Lang, canonicalPath: string): Pick<Metadata, 'robots' | 'alternates'> {
  if (lang === DEFAULT_LANG) return {}
  return { robots: { index: false, follow: true }, alternates: { canonical: canonicalPath } }
}

/** True when a page in `lang` must not be indexed, for routes that build their own head. */
export function isLocalizedUi(lang: Lang): boolean {
  return lang !== DEFAULT_LANG
}

/**
 * The `hreflang` alternates of a page that exists in several languages, for
 * B3 to emit once translated manuals exist: English is the bare URL and
 * `x-default`, every other language is the same URL with `?lang=`. Nothing
 * calls this for UI-only localization, whose pages canonicalize to English.
 */
export function hreflangAlternates(url: string, langs: readonly Lang[]): Record<string, string> {
  const alternates: Record<string, string> = { 'x-default': url, [DEFAULT_LANG]: url }
  for (const lang of langs) if (lang !== DEFAULT_LANG) alternates[lang] = withLang(url, lang)
  return alternates
}
