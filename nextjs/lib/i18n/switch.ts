import { LANG_PARAM, DEFAULT_LANG, type Lang } from './locales'

/**
 * The language switch is two plain links, so it costs the browser no script and works without
 * JavaScript. `/-/lang/<code>` remembers the choice (a cookie, set on a private redirect) and goes
 * back to the page the reader was on, with that language in its URL; `/-/fix/<code>` opens the
 * prefilled translation-fix issue for that page. The proxy answers both (proxy.ts). `/-/` cannot
 * start a command name, so these never collide with a short URL.
 */
export const LANG_SWITCH_PATH = '/-/lang'
export const FIX_PATH = '/-/fix'

/** `to` is the page to return to (a path and query on this site); without it the proxy uses the Referer. */
export function langSwitchHref(lang: Lang, to?: string): string {
  return `${LANG_SWITCH_PATH}/${encodeURIComponent(lang)}${to ? `?to=${encodeURIComponent(to)}` : ''}`
}

export function fixLinkHref(lang: Lang, to?: string): string {
  return `${FIX_PATH}/${encodeURIComponent(lang)}${to ? `?to=${encodeURIComponent(to)}` : ''}`
}

/** A same-site path and query that is safe to redirect to, or null. */
export function safeLocalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value
}

/** `path` with `?lang=` set for a language and, for English (the bare form), removed. */
export function pathInLang(path: string, lang: Lang): string {
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.delete(LANG_PARAM)
  if (lang !== DEFAULT_LANG) url.searchParams.set(LANG_PARAM, lang)
  return `${url.pathname}${url.search}${url.hash}`
}
