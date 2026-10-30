import { source } from './lite'
import type { Lang } from './locales'

export type Vars = Record<string, string | number>
/** A translator; `lang` lets helpers format lists, numbers and dates for the same language. */
export type T<K extends string = string> = { (key: K, vars?: Vars): string; readonly lang: Lang }

/** The index of the `}` that closes the `{` at `open`, or the end of the string. */
export function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}' && --depth === 0) return i
  }
  return text.length
}

/** `one {# page} other {# pages}` as a map of category (or `=n`) to its text. */
export function pluralForms(body: string): Map<string, string> {
  const forms = new Map<string, string>()
  let i = 0
  while (i < body.length) {
    const open = body.indexOf('{', i)
    if (open < 0) break
    const close = closingBrace(body, open)
    forms.set(body.slice(i, open).trim(), body.slice(open + 1, close))
    i = close + 1
  }
  return forms
}

/**
 * Formats a catalog message: `{name}` inserts a value, and
 * `{count, plural, one {# page} few {# pages} other {# pages}}` picks a plural
 * form by the language's own rules (`#` is the number). Nothing else is special,
 * so a message needs no escaping.
 */
export function format(template: string, vars: Vars | undefined, lang: Lang): string {
  if (!template.includes('{')) return template
  let out = ''
  let i = 0
  while (i < template.length) {
    const open = template.indexOf('{', i)
    if (open < 0) {
      out += template.slice(i)
      break
    }
    out += template.slice(i, open)
    const close = closingBrace(template, open)
    const body = template.slice(open + 1, close)
    const comma = body.indexOf(',')
    if (comma < 0) {
      out += String(vars?.[body.trim()] ?? '')
    } else {
      const name = body.slice(0, comma).trim()
      const rest = body.slice(comma + 1).trim()
      const value = Number(vars?.[name] ?? 0)
      if (rest.startsWith('plural,')) {
        const forms = pluralForms(rest.slice('plural,'.length))
        const chosen = forms.get(`=${value}`) ?? forms.get(new Intl.PluralRules(lang).select(value)) ?? forms.get('other') ?? ''
        out += format(chosen.replaceAll('#', value.toLocaleString(lang)), vars, lang)
      }
    }
    i = close + 1
  }
  return out
}

// A message is its English text, which is what the code writes; `source` drops the context that
// tells apart messages whose English is the same but whose translations differ.
export { source }

/**
 * A lookup over one language's translations. English has none (`null`): the message is the text,
 * so English bundles carry no catalog. A message missing from a translation shows in English,
 * which the completeness test prevents.
 */
export function makeT<K extends string>(lang: Lang, messages: Readonly<Partial<Record<K, string>>> | null): T<K> {
  return Object.assign((key: K, vars?: Vars) => format(messages?.[key] ?? source(key), vars, lang), { lang })
}

/** "A or B", "A, B and C": a list the way `lang` writes one. */
export function formatList(items: readonly string[], lang: Lang, type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(lang, { style: 'long', type }).format(items)
}
