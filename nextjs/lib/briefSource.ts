import type { BriefExampleSource } from './docModel'
import type { ClientT } from './i18n/server'

/** The short source label of an In brief example. `tldr-pages` is a project name and stays as written. */
export function briefSourceLabel(source: BriefExampleSource, t: ClientT): string {
  if (source === 'generated') return t('generated · verified')
  return source === 'page' ? t('from EXAMPLES') : 'tldr-pages'
}
