import { canonicalWithDistro, DISTRO_LABEL, type Distro } from './distro'
import type { ManPage } from './docModel'

export const ISSUES_NEW_URL = 'https://github.com/amanthanvi/BetterMan/issues/new'
// Field ids of .github/ISSUE_TEMPLATE/bug_report.yml. Issue forms ignore `body`.
const TEMPLATE = 'bug_report.yml'
// GitHub answers 414 for issue URLs past about 8 KB.
export const MAX_REPORT_HREF_LENGTH = 8000
const MAX_FIELD_CHARS = 100

export type ReportedPage = Pick<ManPage, 'name' | 'section' | 'datasetReleaseId' | 'sourcePackage' | 'sourcePackageVersion'>

function clip(value: string): string {
  const chars = Array.from(value.trim())
  return chars.length > MAX_FIELD_CHARS ? `${chars.slice(0, MAX_FIELD_CHARS - 1).join('')}…` : chars.join('')
}

/**
 * A new bug report prefilled with what triage needs to find the page again.
 * `origin` is null while server rendering, which leaves a path for the URL.
 */
export function reportProblemHref({ page, distro, origin }: { page: ReportedPage; distro: Distro; origin: string | null }): string {
  const citation = `${clip(page.name)}(${clip(page.section)})`
  const path = `/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`
  const url = `${origin ?? ''}${canonicalWithDistro(path, distro)}`
  const pkg = page.sourcePackage ? clip(`${page.sourcePackage} ${page.sourcePackageVersion ?? ''}`) : 'unknown'
  const release = clip(page.datasetReleaseId)
  const title = `[Bug]: ${citation} on ${DISTRO_LABEL[distro]}`

  const full = new URLSearchParams({
    template: TEMPLATE,
    title,
    'what-happened': [
      'What is wrong on this page?',
      '',
      '',
      '---',
      `Page: ${citation}`,
      `Distro: ${DISTRO_LABEL[distro]}`,
      `Package: ${pkg}`,
      `Dataset release: ${release}`,
      `URL: ${url}`,
    ].join('\n'),
    repro: `1. Open ${url}\n2. `,
    version: `Dataset release ${release}`,
  })
  const href = `${ISSUES_NEW_URL}?${full.toString()}`
  if (href.length <= MAX_REPORT_HREF_LENGTH) return href
  return `${ISSUES_NEW_URL}?${new URLSearchParams({ template: TEMPLATE, title }).toString()}`
}
