import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { LicensesResponse } from '../../../lib/api'
import { LicenseEntry, LicensesClient } from './LicensesClient'

vi.mock('../../../components/state/lang', async () => {
  const { testLang } = await import('../../../lib/i18n/testing')
  return { useLang: () => testLang, useT: () => testLang.t }
})

function data(count: number): LicensesResponse {
  return { datasetReleaseId: 'local', ingestedAt: 'now', imageRef: 'test', imageDigest: 'test',
    packageManifest: null, packageManifestUrl: 'https://files.example/manifest.json',
    packages: Array.from({ length: count }, (_, i) => ({ name: `pkg${i}`, version: '1', hasLicenseText: true })) }
}

it('bounds initial large-corpus markup and exposes the full manifest separately', () => {
  const html = renderToStaticMarkup(<LicensesClient distro="debian" data={data(17_300)} />)
  expect(html.match(/<li /g)).toHaveLength(200)
  expect(html).toContain('Load more packages (200 of 17300)')
  expect(html).toContain('View full package manifest (JSON)')
  expect(html).toContain('https://files.example/manifest.json')
})

it('keeps current small-corpus listing and inline provenance', () => {
  const input = { ...data(300), packageManifest: { source: 'curated' } }
  const html = renderToStaticMarkup(<LicensesClient distro="debian" data={input} />)
  expect(html.match(/<li /g)).toHaveLength(300)
  expect(html).toContain('curated')
  expect(html).toMatch(/<pre[^>]*tabindex="0"[^>]*role="group"[^>]*aria-label="Package manifest"/i)
  expect(html).not.toContain('Load more packages')
})

it('credits tldr-pages under CC BY 4.0 with the changes BetterMan makes', () => {
  const html = renderToStaticMarkup(<LicensesClient distro="debian" data={data(1)} />)
  expect(html).toContain('Examples marked tldr-pages come from')
  expect(html).toContain('href="https://github.com/tldr-pages/tldr"')
  expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"')
  expect(html).toContain('converts their placeholders, showing the first of alternative values, and keeps only examples whose flags it verifies')
})

it('shows standard-text attribution and remaining missing identifiers in the complete entry', () => {
  const text = 'Declared license expression: MIT OR LicenseRef-Private\n\nMissing license identifiers after shared and SPDX sources: LicenseRef-Private\n\nStandard text for the declared license MIT; this package ships no license file.\nSource: SPDX License List v3.29.0.\n\nPermission is hereby granted.'
  const html = renderToStaticMarkup(<LicenseEntry license={{ package: 'tool', licenseId: 'pkg:tool', licenseName: 'tool', text }} />)
  expect(html).toContain('Standard text for the declared license MIT; this package ships no license file.')
  expect(html).toContain('Missing license identifiers after shared and SPDX sources: LicenseRef-Private')
  expect(html).toContain('Permission is hereby granted.')
  expect(html).toMatch(/aria-label="License text for tool"/)
})

it('shows an unavailable-expression record without rendering it as HTML', () => {
  const html = renderToStaticMarkup(<LicenseEntry license={{ package: 'tool', licenseId: 'pkg:tool', licenseName: 'tool', text: 'Unparseable license expression: <script>\nNo standard license text could be attached.' }} />)
  expect(html).toContain('Unparseable license expression: &lt;script&gt;')
  expect(html).toContain('No standard license text could be attached.')
  expect(html).not.toContain('<script>')
})

it('dims warning-only packages and marks no license text while retaining the detail button', () => {
  const input = data(1)
  input.packages[0] = { ...input.packages[0], licenseWarning: 'No license text is available for this package.' }
  const html = renderToStaticMarkup(<LicensesClient distro="fedora" data={input} />)
  expect(html).toContain('opacity-50')
  expect(html).toContain('No license text.')
  expect(html).not.toContain('disabled=""')
})

it('wraps long standard text lines and keeps the fixed warning marker escaped', () => {
  const text = 'No license text is available for this package.\n\nDeclared license expression: <script>'
  const html = renderToStaticMarkup(<LicenseEntry license={{ package: 'gap', licenseId: 'pkg:gap', licenseName: 'gap', text }} />)
  expect(html).toContain('whitespace-pre-wrap')
  expect(html).toContain('No license text is available for this package.')
  expect(html).toContain('&lt;script&gt;')
})
