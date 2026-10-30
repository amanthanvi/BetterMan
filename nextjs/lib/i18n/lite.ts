import type { Vars } from './translate'

/**
 * The runtime the browser needs to show a translation, and nothing more. The server has already chosen
 * the language, formatted what depends on it and expanded every plural into its forms, so the browser
 * only fills `{name}` values and picks a plural form. English needs none of it: the message is the text.
 * The full formatter (ICU values and plurals, lists) is `translate.ts`, which only the server imports.
 */
const CONTEXT = '\u0004'

/** The English a message stands for, without its context. */
export function source(message: string): string {
  return message.slice(message.indexOf(CONTEXT) + 1)
}

export function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? '')) : text
}

/** A message with a plural, expanded by the server: each category's whole text, `#` standing for the number. */
export type PluralForms = Record<string, string>
export type Translations = Readonly<Record<string, string | PluralForms>>

/** A message whose English holds a `{count, plural, …}`: only `plural()` formats it. */
export type PluralKey<K extends string> = K extends `${string}plural, ${string}` ? K : never

/** The messages `t` formats: everything but the plurals. */
export type PlainKey<K extends string> = Exclude<K, PluralKey<K>>

export function plural(forms: PluralForms, n: number, lang: string, vars?: Vars): string {
  return fill((forms[new Intl.PluralRules(lang).select(n)] ?? forms.other).replaceAll('#', n.toLocaleString(lang)), vars)
}
