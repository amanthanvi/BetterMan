import { translationFixHref } from './fix'
import { publicLangs } from './gate'
import { DEFAULT_LANG, resolveLang, type Lang } from './locales'
import { loadCatalog, type ServerT } from './server'
import { langSwitchHref } from './switch'
import { makeT } from './translate'

/**
 * A man page's language, as `getServerSideProps` hands it to the plain-HTML
 * renderer. It is derived from the URL's `?lang=` alone (the response is cached
 * per URL), and carries everything the page needs: the strings, the switch's
 * links and the fix link. The static script's strings are not here: each language
 * is its own script bundle (scripts/man-i18n.mjs).
 */
export type ManI18n = {
  lang: Lang
  /** The URL's own `?lang=`, which in-app links carry; null for a bare URL. */
  urlLang: Lang | null
  publicLangs: Lang[]
  /** This page in each public language. */
  langHrefs: Record<string, string>
  /** The client and server groups together. */
  messages: Record<string, string>
  /** Set for a language other than English. */
  fixHref: string | null
}

/** `current` is the request's path and query, without the proxy's release key. */
export async function manI18n(query: string | string[] | undefined, current: string): Promise<ManI18n> {
  const available = publicLangs()
  const urlLang = resolveLang(Array.isArray(query) ? query[0] : query, available)
  const lang = urlLang ?? DEFAULT_LANG
  const catalog = await loadCatalog(lang)
  return {
    lang,
    urlLang,
    publicLangs: [...available],
    langHrefs: Object.fromEntries(available.map((next) => [next, langSwitchHref(next, current)])),
    messages: { ...catalog.client, ...catalog.server },
    fixHref: lang === DEFAULT_LANG ? null : translationFixHref({ lang, page: current }),
  }
}

/** The renderer's translator, from the props `manI18n` returned. */
export function manT(i18n: Pick<ManI18n, 'lang' | 'messages'>): ServerT {
  return makeT(i18n.lang, i18n.messages) as ServerT
}
