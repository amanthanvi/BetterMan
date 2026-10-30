import type { TranslationSitemapItem } from './api'
import { canonicalWithDistro } from './distro'
import { LANGS, setLang, type Lang } from './i18n/locales'

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * One language's translated pages (#395). Every entry lists the route's complete
 * hreflang set (English, each translation and x-default), as Google requires.
 * English pages carry no hreflang in their HTML (it would cost reads on every
 * English view), so each English URL is annotated here once: in the file of the
 * first language, in LANGS order, that translates it.
 */
export function translationUrlset(origin: string, distro: string, lang: Lang, items: TranslationSitemapItem[]): string {
  const rows: string[] = []
  for (const item of items) {
    const english = canonicalWithDistro(`${origin}/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, distro)
    // English (and x-default) only when its page is indexable, as in the page head.
    const locales = LANGS.filter((code) => item.locales.includes(code) && (code !== 'en' || item.englishIndexable !== false))
    const links = [
      ...locales.map((code) => [code, setLang(english, code)] as const),
      ...(locales.includes('en') ? [['x-default', english] as const] : []),
    ].map(([hreflang, href]) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${xml(href)}"/>`).join('\n')
    const urls = locales.find((code) => code !== 'en') === lang && locales.includes('en') ? [english, setLang(english, lang)] : [setLang(english, lang)]
    for (const loc of urls) rows.push(`  <url>\n    <loc>${xml(loc)}</loc>\n${links}\n  </url>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${rows.join('\n')}\n` +
    `</urlset>\n`
}
