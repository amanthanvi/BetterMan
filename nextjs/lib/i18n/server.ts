import type { ClientKey } from './catalog/en/client'
import type { ManKey } from './catalog/en/man'
import type { ServerKey } from './catalog/en/server'
import type { Lang } from './locales'
import type { PlainKey } from './lite'
import { makeT, type T } from './translate'

/** One language's translations in the three groups (docs/i18n.md): the client bundle's, the server's, and the man page script's. English has none. */
export type Catalog = {
  client: Readonly<Partial<Record<ClientKey, string>>>
  server: Readonly<Partial<Record<ServerKey, string>>>
  man: Readonly<Partial<Record<ManKey, string>>>
}

// Each language is its own chunk, so the server loads only the language a request asks for.
const LOADERS: Record<Lang, () => Promise<Catalog>> = {
  en: async () => ({ client: {}, server: {}, man: {} }),
  de: async () => ({
    client: (await import('./catalog/de/client')).client,
    server: (await import('./catalog/de/server')).server,
    man: (await import('./catalog/de/man')).man,
  }),
  fr: async () => ({
    client: (await import('./catalog/fr/client')).client,
    server: (await import('./catalog/fr/server')).server,
    man: (await import('./catalog/fr/man')).man,
  }),
  es: async () => ({
    client: (await import('./catalog/es/client')).client,
    server: (await import('./catalog/es/server')).server,
    man: (await import('./catalog/es/man')).man,
  }),
  'pt-BR': async () => ({
    client: (await import('./catalog/pt-BR/client')).client,
    server: (await import('./catalog/pt-BR/server')).server,
    man: (await import('./catalog/pt-BR/man')).man,
  }),
  ja: async () => ({
    client: (await import('./catalog/ja/client')).client,
    server: (await import('./catalog/ja/server')).server,
    man: (await import('./catalog/ja/man')).man,
  }),
  ru: async () => ({
    client: (await import('./catalog/ru/client')).client,
    server: (await import('./catalog/ru/server')).server,
    man: (await import('./catalog/ru/man')).man,
  }),
}

export function loadCatalog(lang: Lang): Promise<Catalog> {
  return LOADERS[lang]()
}

/** What server code translates with: the server group and the client group both. */
export type ServerT = T<ServerKey | ClientKey>
/** What shared components call: the client's messages without plurals, which only `tn` and the server format. */
export type ClientT = T<PlainKey<ClientKey>>

export type ServerI18n = { lang: Lang; t: ServerT; catalog: Catalog }

/** A server component's translator for `lang`, plus the catalog for handing the client its strings. */
export async function getI18n(lang: Lang): Promise<ServerI18n> {
  const catalog = await loadCatalog(lang)
  return { lang, t: makeT(lang, { ...catalog.client, ...catalog.server }), catalog }
}
