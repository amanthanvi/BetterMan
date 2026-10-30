import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SectionResponse } from '../../../lib/api'
import type { Distro } from '../../../lib/distro'

const mocks = vi.hoisted(() => {
  class FastApiError extends Error {
    constructor(public status: number, public code: string) {
      super(code)
    }
  }
  return {
    FastApiError,
    listSection: vi.fn(),
    permanentRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT;308') }),
    notFound: vi.fn(() => {
      throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
    }),
  }
})
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, permanentRedirect: mocks.permanentRedirect }))
vi.mock('../../../lib/api', () => ({
  FastApiError: mocks.FastApiError,
  listSection: mocks.listSection,
  withDistroFallback: async (distro: Distro, fn: (distro: Distro) => Promise<SectionResponse>) => ({
    distro, data: await fn(distro),
  }),
}))

import SectionPage from './page'

beforeEach(() => vi.clearAllMocks())

it('answers an unknown section with notFound instead of an error page', async () => {
  mocks.listSection.mockRejectedValue(new mocks.FastApiError(404, 'SECTION_NOT_FOUND'))
  await expect(SectionPage({
    params: Promise.resolve({ section: 'zzz' }), searchParams: Promise.resolve({}),
  })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  expect(mocks.notFound).toHaveBeenCalledOnce()
})

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
    // No pagination link; the section switcher and letter jumps are not pagination.
    expect(html).not.toMatch(/href="\/section\/1\?(offset|cursor|before)=/)
  })

  it('offers every letter: groups on this page jump in place, the rest start a page there', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 6000, limit: 200, offset: 0,
      results: [{ name: 'awk', section: '1', title: 'awk', description: 'process text' }, { name: 'bash', section: '1', title: 'bash', description: 'shell' }],
      hasMore: true, nextCursor: 'bash', prevCursor: null,
    })
    const html = renderToStaticMarkup(await SectionPage({ params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ distro: 'fedora' }) }))
    expect(html).toContain('href="#letter-a"')
    expect(html).toContain('href="/section/1?from=z&amp;distro=fedora"')
    expect(html).toContain('aria-label="Filter section 1"')
    expect(html).toContain('this page lists <b class="font-semibold not-italic">awk</b> to')
  })

  it('names the range rather than guessing a position after a letter jump', async () => {
    mocks.listSection.mockResolvedValue({
      section: '1', label: 'User Commands', total: 6000, limit: 200, offset: 0,
      results: [{ name: 'make', section: '1', title: 'make', description: 'build' }, { name: 'man', section: '1', title: 'man', description: 'manual' }],
      hasMore: true, nextCursor: 'man', prevCursor: 'make',
    })
    const html = renderToStaticMarkup(await SectionPage({ params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ from: 'm' }) }))
    expect(html).toContain('Showing make to man, 2 of 6,000 results.')
    expect(html).not.toContain('Showing 1-2')
    expect(html).toContain('href="/section/1?cursor=man"')
    expect(html).toContain('href="/section/1?before=make"')
  })

  it('offers the last page when a letter jump lands past the last name', async () => {
    mocks.listSection.mockResolvedValue({ section: '1', label: 'User Commands', total: 5, limit: 200, offset: 0, results: [], hasMore: false, nextCursor: null, prevCursor: 'z' })
    const html = renderToStaticMarkup(await SectionPage({ params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ from: 'z' }) }))
    expect(html).toContain('No names in section 1 start at Z or later.')
    expect(html).toContain('href="/section/1?before=z">Last page</a>')
    expect(html).not.toContain('aria-disabled="true" class="text-sm text-ink-3">Previous')
  })

  it('says an empty section is empty, with no page to offer', async () => {
    mocks.listSection.mockResolvedValue({ section: '9', label: 'Kernel Routines', total: 0, limit: 200, offset: 0, results: [], hasMore: false, nextCursor: null, prevCursor: null })
    const html = renderToStaticMarkup(await SectionPage({ params: Promise.resolve({ section: '9' }), searchParams: Promise.resolve({}) }))
    expect(html).toContain('Section 9 has no pages in Debian.')
    expect(html).not.toContain('Last page')
  })

  it('starts at a letter, accepting only one letter or digit', async () => {
    mocks.listSection.mockResolvedValue({ section: '1', label: 'User Commands', total: 1, limit: 200, offset: 0, results: [], hasMore: false, nextCursor: null, prevCursor: null })
    await SectionPage({ params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ from: 'Q' }) })
    expect(mocks.listSection).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'q', offset: 0 }))
    await SectionPage({ params: Promise.resolve({ section: '1' }), searchParams: Promise.resolve({ from: 'qq' }) })
    expect(mocks.listSection.mock.lastCall?.[0]).not.toHaveProperty('from')
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
    expect(html).toContain('>First page<')
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


it('redirects bookmarked legacy offsets above 5000 to the first page before querying', async () => {
  await expect(SectionPage({
    params: Promise.resolve({ section: '1' }),
    searchParams: Promise.resolve({ offset: '5200', distro: 'ubuntu' }),
  })).rejects.toThrow('NEXT_REDIRECT;308')
  expect(mocks.permanentRedirect).toHaveBeenCalledWith('/section/1?distro=ubuntu')
  expect(mocks.listSection).not.toHaveBeenCalled()
})
