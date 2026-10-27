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
vi.mock('../../../../lib/requestContext', () => ({ resolveRequestDistro: async () => 'debian' }))
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
