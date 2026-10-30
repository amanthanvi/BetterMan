import type { SearchResult } from '../../lib/api'
import type { ClientT } from '../../lib/i18n/server'
import type { PlainKey } from '../../lib/i18n/lite'
import type { CommonKey } from '../../lib/i18n/catalog/en/common'

const SYMBOL_KEYS = {
  config: 'directive',
  environment: 'environment',
  files: 'file',
  errors: 'errno',
  subcommand: 'subcommand',
  shell: 'shell',
} as const satisfies Record<NonNullable<SearchResult['symbolKind']>, PlainKey<CommonKey>>

export function symbolKindKey(kind: NonNullable<SearchResult['symbolKind']>): PlainKey<CommonKey> {
  return SYMBOL_KEYS[kind]
}

/** Small-caps kind label (fix 15): a task or flag match, a symbol's kind, or what the section documents. */
export function resultKind(r: Pick<SearchResult, 'match' | 'symbolKind' | 'section'>, t: ClientT): string {
  if (r.match === 'task') return t('task')
  if (r.symbolKind) return t(SYMBOL_KEYS[r.symbolKind])
  if (r.match === 'option') return t('flag')
  switch (r.section.charAt(0)) {
    case '1':
    case '6':
    case '8':
      return t('command')
    case '2':
      return t('system call')
    case '3':
      return t('function')
    case '4':
      return t('device')
    case '5':
      return t('file format')
    case '7':
      return t('concept')
    case '9':
      return t('kernel')
    default:
      return t('page')
  }
}
