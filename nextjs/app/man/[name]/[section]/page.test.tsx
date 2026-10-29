import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchManMetaByNameAndSection: vi.fn(),
  fetchManByNameAndSectionOrAlias: vi.fn(),
  fetchRelated: vi.fn(async () => ({ items: [] })),
}))
vi.mock('../../../../lib/api', () => ({
  ...api,
  FastApiError: class extends Error {},
  withDistroFallback: async (distro: string, fn: (distro: string) => Promise<unknown>) => ({ distro, data: await fn(distro) }),
}))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('../../../../lib/requestContext', async original => ({ ...await original<typeof import('../../../../lib/requestContext')>(), resolveRequestDistro: async () => 'debian' }))
vi.mock('../../../../components/man/ManPageView', () => ({ ManPageView: () => <article>The complete manual</article> }))
vi.mock('../../../../components/seo/JsonLdHead', () => ({ JsonLdHead: () => null }))

import ManPage from './page'

it('waits for the document before returning the initial page, avoiding a painted shell and delayed Suspense reveal', async () => {
  const page = { name: 'bash', section: '1', title: 'Shell', datasetReleaseId: '2026-10-26+fixture' }
  api.fetchManMetaByNameAndSection.mockResolvedValue({ page })
  let markRequested!: () => void
  let resolveDocument!: (value: unknown) => void
  const requested = new Promise<void>(resolve => { markRequested = resolve })
  const document = new Promise(resolve => { resolveDocument = resolve })
  api.fetchManByNameAndSectionOrAlias.mockImplementation(() => {
    markRequested()
    return document
  })
  const response = ManPage({ params: Promise.resolve({ name: 'bash', section: '1' }), searchParams: Promise.resolve({}) })
  expect(await Promise.race([response.then(() => 'shell'), requested.then(() => 'document pending')])).toBe('document pending')
  resolveDocument({ kind: 'page', data: { page, content: {}, variants: [] } })
  expect(renderToStaticMarkup(await response)).toContain('<article>The complete manual</article>')
})

it('uses the selected provider for metadata and initial HTML without adding a switch UI', async () => {
  vi.clearAllMocks()
  const page = { name: 'shared', section: '1', title: 'Shared', datasetReleaseId: 'fixture', sourcePackage: 'alternate' }
  api.fetchManByNameAndSectionOrAlias.mockResolvedValue({ kind: 'page', data: { page, content: {}, variants: [] } })
  const response = await ManPage({ params: Promise.resolve({ name: 'shared', section: '1' }), searchParams: Promise.resolve({ pkg: 'alternate' }) })
  expect(renderToStaticMarkup(response)).toContain('The complete manual')
  expect(api.fetchManByNameAndSectionOrAlias).toHaveBeenCalledWith({ distro: 'debian', name: 'shared', section: '1', pkg: 'alternate' })
  expect(api.fetchManMetaByNameAndSection).not.toHaveBeenCalled()
})
