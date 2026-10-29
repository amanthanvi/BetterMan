import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { LicensesResponse } from '../../../lib/api'
import { LicensesClient } from './LicensesClient'

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
