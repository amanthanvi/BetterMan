
/**
 * The UI language contract (docs/i18n.md). The language comes from the URL's
 * `?lang=` alone, so cached HTML never depends on a cookie or Accept-Language.
 * English is the default and the source language; a bare URL is English.
 */
export const LANGS = ['en', 'de', 'fr', 'es', 'pt-BR', 'ja', 'ru'] as const
export type Lang = (typeof LANGS)[number]
export type TranslatedLang = Exclude<Lang, 'en'>

export const DEFAULT_LANG: Lang = 'en'
export const LANG_PARAM = 'lang'
export const LANG_COOKIE = 'bm-lang'
export const LANG_STORAGE_KEY = 'bm-lang'

/** Each language in its own words, for the switch. Never translated. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  ja: '日本語',
  ru: 'Русский',
}

export type ReviewStatus = 'needs-review' | 'reviewed'

export type CatalogMeta = {
  lang: TranslatedLang
  /** A language renders publicly only once it is `reviewed`. */
  status: ReviewStatus
  translatedBy: string
  translatedOn: string
  reviewedBy: readonly string[]
  reviewedOn: string | null
}

/** A supported language code (`pt-br` and `PT-BR` read as `pt-BR`), else null. */
export function normalizeLang(value: unknown): Lang | null {
  if (typeof value !== 'string') return null
  const wanted = value.trim().toLowerCase()
  return LANGS.find((lang) => lang.toLowerCase() === wanted) ?? null
}

/** A requested language that is one of `available`, else null (it then renders English). */
export function resolveLang(value: unknown, available: readonly Lang[]): Lang | null {
  const lang = normalizeLang(value)
  return lang && available.includes(lang) ? lang : null
}

/** Each language in its own name; the name #472's helper (B3) gave it. */
export const LANG_LABEL = LANG_NAMES

/** The translated language a URL asks for, or null for English and unknown codes. */
export function translatedLang(value: unknown): TranslatedLang | null {
  const lang = normalizeLang(value)
  return lang === null || lang === 'en' ? null : lang
}

/** Sets or clears `?lang=` on a path or absolute URL; English is the bare form (content URLs, canonicals, sitemaps). */
export function setLang(loc: string, lang: Lang | null): string {
  const isAbsolute = /^https?:\/\//.test(loc)
  const url = isAbsolute ? new URL(loc) : new URL(loc, 'https://example.invalid')
  if (lang && lang !== DEFAULT_LANG) url.searchParams.set(LANG_PARAM, lang)
  else url.searchParams.delete(LANG_PARAM)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
}

/** Adds `?lang=` to an in-app or absolute URL, carrying the page's explicit choice (`en` included); null leaves it bare. */
export function withLang(loc: string, lang: Lang | null | undefined): string {
  if (!lang) return loc
  const isAbsolute = /^https?:\/\//.test(loc)
  const url = isAbsolute ? new URL(loc) : new URL(loc, 'https://example.invalid')
  url.searchParams.set(LANG_PARAM, lang)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
}
