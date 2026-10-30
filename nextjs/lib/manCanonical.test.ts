import { expect, it } from 'vitest'
import type { ManPageResponse } from './docModel'
import { manCanonicalPath } from './manCanonical'

const data: ManPageResponse = {
  page: { id: 'tar', datasetReleaseId: 'r', locale: 'en', distro: 'ubuntu', name: 'tar', section: '1', title: '', description: '', sourcePackage: 'tar' },
  content: { blocks: [], toc: [] }, variants: [],
}

it.each([
  [null, 'tar', '/man/tar/1?distro=ubuntu'],
  [null, 'alternate', '/man/tar/1?distro=ubuntu'],
  [{ packages: ['tar', 'alternate'], defaultPackage: 'tar', policy: 'curated' as const, sameAsDefault: false }, 'alternate', '/man/tar/1?distro=ubuntu&pkg=alternate'],
  [{ packages: ['tar', 'alternate'], defaultPackage: 'tar', policy: 'curated' as const, sameAsDefault: true }, 'alternate', '/man/tar/1?distro=ubuntu'],
  [{ packages: ['tar', 'alternate'], defaultPackage: 'tar', policy: 'curated' as const }, 'tar', '/man/tar/1?distro=ubuntu'],
])('uses the clean canonical for missing provider data, winners and identical content (%s, %s)', (providers, pkg, expected) => {
  expect(manCanonicalPath({ ...data, providers }, 'ubuntu', pkg)).toBe(expected)
})
