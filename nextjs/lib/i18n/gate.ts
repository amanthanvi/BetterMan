import { meta as de } from './catalog/de/meta'
import { meta as es } from './catalog/es/meta'
import { meta as fr } from './catalog/fr/meta'
import { meta as ja } from './catalog/ja/meta'
import { meta as ptBR } from './catalog/pt-BR/meta'
import { meta as ru } from './catalog/ru/meta'
import { LANGS, normalizeLang, resolveLang, type CatalogMeta, type Lang, type TranslatedLang } from './locales'

/**
 * The review gate. Server code only (the proxy and the renderers): the browser bundles never carry the
 * catalogs' metadata, they are told which languages are public.
 */
export const CATALOG_META: Record<TranslatedLang, CatalogMeta> = { de, fr, es, 'pt-BR': ptBR, ja, ru }

/**
 * Languages a deployment may show before review, from `BM_I18N_PREVIEW`: a
 * comma-separated list of codes, or `all`. Unset in production. A preview
 * deployment (or the E2E server) sets it so reviewers can read a catalog that
 * is still `needs-review`.
 */
export function previewLangs(value: string | undefined = process.env.BM_I18N_PREVIEW): readonly TranslatedLang[] {
  const raw = value?.trim()
  if (!raw) return []
  const translated = LANGS.filter((lang): lang is TranslatedLang => lang !== 'en')
  if (raw.toLowerCase() === 'all') return translated
  const wanted = new Set(raw.split(',').map((item) => normalizeLang(item)))
  return translated.filter((lang) => wanted.has(lang))
}

/** English, every `reviewed` language, and any language the deployment previews. Always starts with English. */
export function publicLangs(preview: string | undefined = process.env.BM_I18N_PREVIEW): readonly Lang[] {
  const shown = new Set<Lang>(previewLangs(preview))
  return LANGS.filter((lang) => lang === 'en' || CATALOG_META[lang].status === 'reviewed' || shown.has(lang))
}

/** A requested language, or null when it is not a language or is not public yet (it then renders English). */
export function resolvePublicLang(value: unknown): Lang | null {
  return resolveLang(value, publicLangs())
}
