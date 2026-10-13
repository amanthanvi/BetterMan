import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { buildManHref, SearchResultsClient } from './SearchResultsClient'

it('places the option fragment after the distro query', () => {
  expect(buildManHref({ distro: 'ubuntu', name: 'tar', section: '1', anchorId: 'opt-create' }))
    .toBe('/man/tar/1?distro=ubuntu#opt-create')
  expect(buildManHref({ distro: 'debian', name: 'tar', section: '1' })).toBe('/man/tar/1')
  expect(buildManHref({ distro: 'debian', name: 'tar', section: '1', anchorId: 'sort=' })).toBe('/man/tar/1#sort%3D')
  expect(buildManHref({ distro: 'debian', name: 'tar', section: '1', anchorId: 'no~2' })).toBe('/man/tar/1#no~2')
})

it('renders an options badge and anchored link without changing its accessible name', () => {
  const markup = renderToStaticMarkup(<SearchResultsClient distro="ubuntu" q="--create" section="" initial={{
    query: '--create', suggestions: [], hasMore: false,
    results: [{ name: 'tar', section: '1', title: 'tar', description: 'Archive tool', highlights: [], match: 'option', anchorId: 'opt-create' }],
  }} />)
  expect(markup).toContain('href="/man/tar/1?distro=ubuntu#opt-create"')
  expect(markup).toContain('aria-label="tar(1)"')
  expect(markup).toContain('class="font-mono text-xs text-muted">options</span>')
})
