import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { SearchResponse } from '../../../lib/api'
import { SearchResultsClient } from './SearchResultsClient'

vi.mock('../../../components/ui/LinkPendingHint', () => ({ LinkPendingHint: () => null }))

function render(q: string, overrides: Partial<SearchResponse> = {}) {
  return renderToStaticMarkup(<SearchResultsClient distro="debian" q={q} section="" initial={{
    query: q, results: [], suggestions: [], hasMore: false, ...overrides,
  }} />)
}

describe('search result copy', () => {
  it('gives honest guidance for unsupported multi-word queries', () => {
    const html = render('how do I extract a tarball')
    expect(html).toContain('No results for')
    expect(html).toContain('Search command names, flags, or words from a page’s description.')
    expect(html).toContain('natural-language questions are not supported yet')
    expect(html).not.toContain('Did you mean')
  })

  it('does not advertise corrections on ordinary successful lookups', () => {
    const html = render('tar', {
      results: [{ name: 'tar', section: '1', title: 'tar(1)', description: 'archive files', highlights: [] }],
      suggestions: ['tarsnap', 'tac'],
    })
    expect(html).toContain('tar(1)')
    expect(html).not.toContain('Did you mean')
    expect(html).not.toContain('not supported yet')
  })

  it('advertises an explicit spelling correction alongside corrected results', () => {
    const html = render('gti', {
      results: [{ name: 'git', section: '1', title: 'git(1)', description: 'content tracker', highlights: [] }],
      suggestions: ['git'], correctedQuery: 'git',
    })
    expect(html).toContain('Did you mean:')
    expect(html).toContain('href="/search?q=git"')
  })

  it('links real spelling corrections and deduplicates their names', () => {
    const html = render('grpe', { suggestions: ['grep', 'grep', 'grpe'] })
    expect(html).toContain('Did you mean:')
    expect(html.match(/href="\/search\?q=grep"/g)).toHaveLength(1)
    expect(html).not.toContain('q=grpe')
  })

  it('keeps option deep links and all cluster highlights', () => {
    const html = render('tar -xzf', { results: [{ name: 'tar', section: '1', title: 'tar(1)', description: 'archive files', highlights: ['-x, --extract', '-z, --gzip', '-f, --file'], match: 'option', anchorId: 'extract' }] })
    expect(html).toContain('href="/man/tar/1#extract"')
    expect(html).toContain('-x, --extract')
    expect(html).toContain('-z, --gzip')
    expect(html).toContain('-f, --file')
  })
})
