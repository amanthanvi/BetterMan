import { ISSUES_NEW_URL } from '../githubIssues'
import type { Lang } from './locales'

// Field ids of .github/ISSUE_TEMPLATE/translation_fix.yml. Issue forms ignore `body`.
const TEMPLATE = 'translation_fix.yml'
const MAX_FIELD_CHARS = 200

function clip(value: string): string {
  const chars = Array.from(value.trim())
  return chars.length > MAX_FIELD_CHARS ? `${chars.slice(0, MAX_FIELD_CHARS - 1).join('')}…` : chars.join('')
}

/**
 * "Suggest a fix for this translation": a new GitHub issue from the translation
 * form, prefilled with the language, the page it was seen on and, when the link
 * is for one string, that string's catalog key. A page-level link leaves the
 * key for the reporter, who can quote the text instead.
 */
export function translationFixHref({ lang, page, key }: { lang: Lang; page: string; key?: string }): string {
  const params = new URLSearchParams({
    template: TEMPLATE,
    title: `[Translation]: ${lang}${key ? ` ${clip(key)}` : ''}`,
    locale: lang,
    page: clip(page),
  })
  if (key) params.set('key', clip(key))
  return `${ISSUES_NEW_URL}?${params.toString()}`
}
