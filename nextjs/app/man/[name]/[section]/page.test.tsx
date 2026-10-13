import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManPageResponse } from '../../../../lib/docModel'
import type { SearchParams } from '../../../../lib/requestContext'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), related: vi.fn(), limited: vi.fn(), redirect: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(), permanentRedirect: mocks.redirect, useServerInsertedHTML: vi.fn() }))
vi.mock('../../../../lib/rateLimit', () => ({ isRateLimited: mocks.limited }))
vi.mock('../../../../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../lib/api')>()
  return { ...original, fetchManByNameAndSectionOrAlias: mocks.fetch, fetchRelated: mocks.related }
})
vi.mock('../../../../components/man/ManPageView', () => ({ ManPageView: () => <div>Normal man page</div> }))

import ManPage from './page'
import { FastApiError } from '../../../../lib/api'

function response(distro: string, text: string, targetSha = 'other'): ManPageResponse {
  return {
    page: { id: distro, distro, name: 'tar', section: '1', datasetReleaseId: '2026', locale: 'en', title: 'tar', description: 'Archive.' },
    content: { toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text }] }] },
    variants: [{ distro: 'debian', datasetReleaseId: '2026', contentSha256: 'base' }, { distro: 'ubuntu', datasetReleaseId: '2026', contentSha256: targetSha }],
  }
}
const render = async (searchParams: SearchParams = { diff: 'ubuntu' }, name = 'tar') => renderToStaticMarkup(await ManPage({
  params: Promise.resolve({ name, section: '1' }), searchParams: Promise.resolve(searchParams),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.limited.mockResolvedValue(false)
  mocks.fetch.mockImplementation(async ({ distro }: { distro: string }) => ({ kind: 'page', data: response(distro, distro === 'ubuntu' ? 'After.' : 'Before.') }))
  mocks.related.mockResolvedValue({ items: [] })
  mocks.redirect.mockImplementation(() => { throw new Error('REDIRECT') })
})

describe('man page distribution comparison route', () => {
  it('uses the page bucket before both content reads and skips related links', async () => {
    const html = await render()
    expect(mocks.limited).toHaveBeenCalledWith(expect.any(Headers), 'page')
    expect(mocks.limited.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0])
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.fetch).toHaveBeenLastCalledWith({ distro: 'ubuntu', name: 'tar', section: '1' })
    expect(mocks.related).not.toHaveBeenCalled()
    expect(html).toContain('Comparing Debian → Ubuntu')
    expect(html).toContain('aria-label="Changed"')
    expect(html).not.toContain('Normal man page')
  })

  it('does not read either comparison page when the page bucket is exhausted', async () => {
    mocks.limited.mockResolvedValueOnce(true)
    expect(await render()).toContain('Too many comparison requests.')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('short circuits identical content hashes without fetching the target', async () => {
    mocks.fetch.mockResolvedValue({ kind: 'page', data: response('debian', 'Same.', 'base') })
    expect(await render()).toContain('These distribution variants are identical.')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('handles an unsupported target without fetching it', async () => {
    expect(await render({ diff: 'invalid' })).toContain('Choose a supported distribution')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.limited).toHaveBeenCalledWith(expect.any(Headers), 'page')
  })

  it.each(['invalid', ''])('rate gates an invalid or empty diff before the baseline read: %s', async (diff) => {
    mocks.limited.mockResolvedValueOnce(true)
    expect(await render({ diff })).toContain('Too many comparison requests.')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('handles a missing target without falling back to another distro', async () => {
    mocks.fetch.mockImplementation(async ({ distro }: { distro: string }) => {
      if (distro === 'ubuntu') throw new FastApiError(404, 'RELEASE_NOT_FOUND', 'Missing release')
      return { kind: 'page', data: response(distro, 'Before.') }
    })
    expect(await render()).toContain('Ubuntu variant is unavailable for this page.')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not read a target absent from the advertised variants', async () => {
    const baseline = response('debian', 'Before.')
    baseline.variants = baseline.variants.slice(0, 1)
    mocks.fetch.mockResolvedValue({ kind: 'page', data: baseline })
    expect(await render()).toContain('Ubuntu variant is unavailable for this page.')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('labels a fallback baseline by its real distribution', async () => {
    mocks.fetch.mockImplementation(async ({ distro }: { distro: string }) => {
      if (distro === 'alpine') throw new FastApiError(404, 'RELEASE_NOT_FOUND', 'Missing release')
      return { kind: 'page', data: response(distro, distro) }
    })
    const html = await render({ distro: 'alpine', diff: 'ubuntu' })
    expect(html).toContain('Comparing Debian → Ubuntu')
    expect(html).not.toContain('Comparing Alpine')
    expect(html).toContain('href="/man/tar/1?distro=debian"')
  })

  it('rejects a target returned under the wrong distribution label', async () => {
    mocks.fetch.mockResolvedValue({ kind: 'page', data: response('debian', 'Before.') })
    expect(await render()).toContain('Ubuntu variant is unavailable for this page.')
  })

  it('handles a target read failure without breaking the baseline reading route', async () => {
    mocks.fetch.mockImplementation(async ({ distro }: { distro: string }) => {
      if (distro === 'ubuntu') throw new Error('Content storage unavailable')
      return { kind: 'page', data: response(distro, 'Before.') }
    })
    const html = await render()
    expect(html).toContain('Comparison is unavailable right now. Try again later.')
    expect(html).toContain('href="/man/tar/1?distro=debian"')
  })

  it('preserves the diff parameter and baseline distro across canonical alias redirects', async () => {
    mocks.fetch.mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1' })
    await expect(render({ diff: 'ubuntu' }, 'gunzip')).rejects.toThrow('REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/man/gzip/1?diff=ubuntu&distro=debian')
  })

  it('keeps regular reading behavior unchanged when diff is absent', async () => {
    expect(await render({})).toContain('Normal man page')
    expect(mocks.limited).not.toHaveBeenCalled()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.related).toHaveBeenCalledTimes(1)
  })
})
