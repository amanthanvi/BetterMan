import type { ClientKey } from './catalog/en/client'
import type { ManKey } from './catalog/en/man'
import type { ServerKey } from './catalog/en/server'
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
