import type { ClientKey } from './catalog/en/client'
import type { ManKey } from './catalog/en/man'
import type { ServerKey } from './catalog/en/server'
import { CATALOG_META } from './gate'
import type { TranslatedLang } from './locales'
import { makeT } from './translate'

/** English translators for tests: the same catalog the app ships, so assertions read the real copy. */
export const tClient = makeT<ClientKey>('en', null)
export const tServer = makeT<ServerKey | ClientKey>('en', null)
export const tMan = makeT<ManKey>('en', null)

/** What `useLang()` returns in a component test: English, no remembered language, no other public language. */
export const testLang = {
  lang: 'en',
  urlLang: null,
  preferred: 'en',
  publicLangs: ['en'],
  t: tClient,
  tn: (_key: string, _n: number, english: string) => english,
  hrefFor: (lang: string) => `?lang=${lang}`,
  remember: () => {},
  setLang: () => {},
} as const

const held = new Map<TranslatedLang, (typeof CATALOG_META)[TranslatedLang]['status']>()

/**
 * Every language is reviewed, so a test of the review gate holds some back as `needs-review`, as a
 * language is while it waits for review. Call `releaseHeld` after each test.
 */
export function holdBack(...langs: TranslatedLang[]): void {
  for (const lang of langs) {
    if (!held.has(lang)) held.set(lang, CATALOG_META[lang].status)
    CATALOG_META[lang].status = 'needs-review'
  }
}

export function releaseHeld(): void {
  for (const [lang, status] of held) CATALOG_META[lang].status = status
  held.clear()
}
