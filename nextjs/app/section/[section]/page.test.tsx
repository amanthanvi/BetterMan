import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SectionResponse } from '../../../lib/api'
import type { Distro } from '../../../lib/distro'

const mocks = vi.hoisted(() => ({ listSection: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('../../../lib/api', () => ({
  listSection: mocks.listSection,
  withDistroFallback: async (distro: Distro, fn: (distro: Distro) => Promise<SectionResponse>) => ({
    distro, data: await fn(distro),
  }),
}))

import SectionPage from './page'

beforeEach(() => vi.clearAllMocks())

describe('section browse pagination', () => {
  it('keeps both navigation directions cursor-based past the legacy offset cap', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 6000, limit: 200, offset: 5200,
      results: [{ name: 'tail', section: '1', title: 'tail', description: 'last lines' }],
      hasMore: true, nextCursor: 'tail', prevCursor: 'tail',
    })
    const html = renderToStaticMarkup(await SectionPage({
      params: Promise.resolve({ section: '1' }),
      searchParams: Promise.resolve({ distro: 'ubuntu', offset: '5200', cursor: 'sort' }),
    }))
    expect(mocks.listSection).toHaveBeenCalledWith({
      distro: 'ubuntu', section: '1', limit: 200, offset: 5200, cursor: 'sort', before: undefined,
    })
    expect(html).toContain('href="/section/1?offset=5000&amp;before=tail&amp;distro=ubuntu"')
    expect(html).toContain('href="/section/1?offset=5201&amp;cursor=tail&amp;distro=ubuntu"')
    expect(html).toContain('Showing 5201-5201 of 6,000 results.')
  })

  it('uses backend cursor boundaries instead of a possibly stale section total', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 6000, limit: 200, offset: 0,
      results: [{ name: 'awk', section: '1', title: 'awk', description: 'process text' }],
      hasMore: false, nextCursor: null, prevCursor: null,
    })
    const html = renderToStaticMarkup(await SectionPage({
      params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({}),
    }))
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(html).not.toContain('href="/section/1')
  })

  it('passes the previous-page name boundary through without a forward cursor', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 0, limit: 200, offset: 0,
      results: [], hasMore: false, nextCursor: null, prevCursor: null,
    })
    await SectionPage({
      params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ before: 'bash' }),
    })
    expect(mocks.listSection).toHaveBeenCalledWith({
      distro: 'debian', section: '1', limit: 200, offset: 0, cursor: undefined, before: 'bash',
    })
  })

  it.each([
    { offset: '400' },
    { offset: '400', cursor: 'tail' },
    { cursor: 'tail' },
    { before: 'awk' },
  ])('offers first-page recovery for an empty pagination result: %j', async (pagination) => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 200, limit: 200, offset: Number(pagination.offset ?? 0),
      results: [], hasMore: false, nextCursor: null, prevCursor: null,
    })
    const html = renderToStaticMarkup(await SectionPage({
      params: Promise.resolve({ section: '1' }),
      searchParams: Promise.resolve({ distro: 'ubuntu', ...pagination }),
    }))
    expect(html).toContain('href="/section/1?distro=ubuntu"')
    expect(html).toContain('>First page</a>')
    expect(html).toContain('Showing 0 of 200 results.')
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(html).not.toContain('href="/section/1?offset=')
    expect(html).not.toContain('href="/section/1?cursor=')
    expect(html).not.toContain('href="/section/1?before=')
  })

  it('does not offer a redundant restart for an empty first page', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 0, limit: 200, offset: 0,
      results: [], hasMore: false, nextCursor: null, prevCursor: null,
    })
    const html = renderToStaticMarkup(await SectionPage({
      params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({}),
    }))
    expect(html).not.toContain('First page')
  })
})
