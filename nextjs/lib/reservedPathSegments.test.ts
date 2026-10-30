import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { reservedPathSegments } from './reservedPathSegments'

const projectDir = fileURLToPath(new URL('..', import.meta.url))

describe('reservedPathSegments', () => {
  let scratch: string | undefined
  afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
  })

  it('covers every top-level route and public asset of this app', () => {
    const reserved = reservedPathSegments(projectDir)
    expect(reserved).toEqual(
      expect.arrayContaining([
        '_next',
        'api',
        'bookmarks',
        'concept',
        'favicon.ico',
        'fonts',
        'history',
        'licenses',
        'man',
        'opengraph-image',
        'opensearch.xml',
        'robots.txt',
        'search',
        'section',
        'site.webmanifest',
        'sitemap.xml',
        'sitemaps-internal',
        'sw.js',
      ]),
    )
    expect(reserved.some((segment) => /^[([@]/.test(segment))).toBe(false)
  })

  it('reads route groups, skips dynamic, private, and slot folders, and ignores colocated files', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'bm-reserved-'))
    const touch = (file: string) => {
      mkdirSync(path.dirname(path.join(scratch!, file)), { recursive: true })
      writeFileSync(path.join(scratch!, file), '')
    }
    touch('app/(site)/Docs/page.tsx')
    touch('app/(site)/(nested)/about/page.tsx')
    touch('app/[...short]/page.tsx')
    touch('app/_lib/x.ts')
    touch('app/@modal/page.tsx')
    touch('app/layout.tsx')
    touch('app/providers.tsx')
    touch('app/icon.png')
    touch('public/Logo.svg')
    touch('pages/_app.tsx')
    touch('pages/Guide/[slug].tsx')
    touch('pages/[catch].tsx')

    expect(reservedPathSegments(scratch)).toEqual(['_next', 'about', 'docs', 'guide', 'icon', 'logo.svg'])
  })
})
