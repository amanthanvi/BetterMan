import { describe, expect, it } from 'vitest'

import { ISSUES_NEW_URL, MAX_REPORT_HREF_LENGTH, reportProblemHref, type ReportedPage } from './reportProblem'

const tar: ReportedPage = {
  name: 'tar',
  section: '1',
  datasetReleaseId: 'debian-2026-10-01+a1b2c3',
  sourcePackage: 'tar',
  sourcePackageVersion: '1.35+dfsg-3',
}

function fields(href: string) {
  const url = new URL(href)
  expect(`${url.origin}${url.pathname}`).toBe(ISSUES_NEW_URL)
  return url.searchParams
}

describe('reportProblemHref', () => {
  it('prefills the bug report form with the page, distro, release, package and canonical URL', () => {
    const params = fields(reportProblemHref({ page: tar, distro: 'debian', origin: 'https://betterman.sh' }))
    expect(params.get('template')).toBe('bug_report.yml')
    expect(params.get('title')).toBe('[Bug]: tar(1) on Debian')
    const body = params.get('what-happened')!
    expect(body).toContain('Page: tar(1)\n')
    expect(body).toContain('Distro: Debian\n')
    expect(body).toContain('Package: tar 1.35+dfsg-3\n')
    expect(body).toContain('Dataset release: debian-2026-10-01+a1b2c3\n')
    expect(body).toContain('URL: https://betterman.sh/man/tar/1')
    expect(params.get('repro')).toBe('1. Open https://betterman.sh/man/tar/1\n2. ')
    expect(params.get('version')).toBe('Dataset release debian-2026-10-01+a1b2c3')
    expect(params.has('body')).toBe(false)
  })

  it('keeps Debian canonical URLs bare and names other distros', () => {
    const params = fields(reportProblemHref({ page: tar, distro: 'macos', origin: 'https://betterman.sh' }))
    expect(params.get('title')).toBe('[Bug]: tar(1) on macOS (BSD-licensed subset)')
    expect(params.get('what-happened')).toContain('URL: https://betterman.sh/man/tar/1?distro=macos')
  })

  it('encodes reserved characters so they survive the round trip', () => {
    const page = { ...tar, name: 'a&b=c#d+e', section: '3pm', sourcePackage: null, sourcePackageVersion: null }
    const href = reportProblemHref({ page, distro: 'debian', origin: 'https://betterman.sh' })
    expect(href).not.toContain('#')
    const params = fields(href)
    expect(params.get('title')).toBe('[Bug]: a&b=c#d+e(3pm) on Debian')
    expect(params.get('what-happened')).toContain('Package: unknown\n')
    expect(params.get('what-happened')).toContain('URL: https://betterman.sh/man/a%26b%3Dc%23d%2Be/3pm')
  })

  it('leaves a path while server rendering', () => {
    const params = fields(reportProblemHref({ page: tar, distro: 'ubuntu', origin: null }))
    expect(params.get('what-happened')).toContain('URL: /man/tar/1?distro=ubuntu')
  })

  it('stays under the URL limit for oversized metadata', () => {
    const wide = '日'.repeat(500)
    const page = { name: ':'.repeat(200), section: '1', datasetReleaseId: wide, sourcePackage: wide, sourcePackageVersion: wide }
    const href = reportProblemHref({ page, distro: 'freebsd', origin: 'https://betterman.sh' })
    expect(href.length).toBeLessThanOrEqual(MAX_REPORT_HREF_LENGTH)
    const params = fields(href)
    expect(params.get('what-happened')).toContain(`Dataset release: ${'日'.repeat(99)}…`)
    expect(params.get('what-happened')).toContain(`/man/${'%3A'.repeat(200)}/1?distro=freebsd`)
  })

  it('falls back to the template and title when the details cannot fit', () => {
    const page = { ...tar, name: '%'.repeat(2000) }
    const href = reportProblemHref({ page, distro: 'debian', origin: 'https://betterman.sh' })
    expect(href.length).toBeLessThanOrEqual(MAX_REPORT_HREF_LENGTH)
    expect([...fields(href).keys()]).toEqual(['template', 'title'])
  })
})
