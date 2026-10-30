import { closingBrace, pluralForms } from './translate'
import type { PluralForms, Translations } from './lite'

/**
 * Turns a catalog into what the browser reads. A message with a plural becomes its forms, each the whole
 * text with that form in place, so the browser never parses ICU; everything else stays a string.
 * The server does this once per page for the client and man script groups.
 */
export function expandPlurals(messages: Readonly<Partial<Record<string, string>>>): Translations {
  const out: Record<string, string | PluralForms> = {}
  for (const [key, text] of Object.entries(messages)) {
    if (text === undefined) continue
    const start = text.indexOf('{count, plural,')
    if (start < 0) {
      out[key] = text
      continue
    }
    const end = closingBrace(text, start)
    const forms: PluralForms = {}
    for (const [category, form] of pluralForms(text.slice(start + '{count, plural,'.length, end))) {
      forms[category] = `${text.slice(0, start)}${form}${text.slice(end + 1)}`
    }
    out[key] = forms
  }
  return out
}
