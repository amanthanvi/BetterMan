'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

import type { ClientKey } from '../../lib/i18n/catalog/en/client'
import { fill, plural, source, type PlainKey, type PluralKey, type Translations } from '../../lib/i18n/lite'
import type { Lang } from '../../lib/i18n/locales'
import type { T } from '../../lib/i18n/translate'

type ClientT = T<PlainKey<ClientKey>>

type LangContextValue = {
  /** The language this page was rendered in, from the URL alone. */
  lang: Lang
  /** The URL's own `?lang=`, which in-app links carry; null for a bare URL. */
  urlLang: Lang | null
  t: ClientT
  /** A message with a plural. English is the caller's own text (`english`), as it was before there were languages. */
  tn: (key: PluralKey<ClientKey>, n: number, english: string, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangContextValue | null>(null)

/**
 * The page's language and its client strings. The server chose the language from the URL, formatted
 * what depends on it and sent only another language's translations, so English carries no catalog and
 * none of the formatting code (docs/i18n.md). The layout is shared across client navigations, so when
 * the URL names another public language than the one rendered, the page reloads.
 */
export function LangProvider({
  children,
  lang,
  messages,
  publicLangs,
}: {
  children: React.ReactNode
  lang: Lang
  /** Translations of a language other than English. */
  messages?: Translations
  publicLangs: readonly Lang[]
}) {
  const requested = useSearchParams()?.get('lang')?.toLowerCase()
  const urlLang = publicLangs.find((candidate) => candidate.toLowerCase() === requested) ?? null

  // Reload when a client navigation lands on another language (the layout is shared). Only a site with a second language can.
  useEffect(() => {
    if (publicLangs.length > 1 && (urlLang ?? 'en') !== lang) window.location.reload()
  }, [lang, urlLang, publicLangs])

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      urlLang,
      t: Object.assign((key: string, vars?: Record<string, string | number>) => {
        const found = messages?.[key]
        return fill(typeof found === 'string' ? found : source(key), vars)
      }, { lang }),
      tn: (key, n, english, vars) => {
        const found = messages?.[key]
        return typeof found === 'object' ? plural(found, n, lang, vars) : english
      },
    }),
    [lang, urlLang, messages],
  )
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within <LangProvider>')
  return ctx
}

/** The client translator. */
export function useT(): ClientT {
  return useLang().t
}
