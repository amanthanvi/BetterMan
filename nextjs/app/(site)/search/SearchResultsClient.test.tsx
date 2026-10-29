import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SearchResponse } from '../../../lib/api'
import type { Distro } from '../../../lib/distro'
import { SearchResultsClient } from './SearchResultsClient'

const distroState = vi.hoisted(() => ({ urlDistro: null as Distro | null }))

vi.mock('../../../components/ui/LinkPendingHint', () => ({ LinkPendingHint: () => null }))
vi.mock('../../../components/state/distro', () => ({ useDistro: () => ({ urlDistro: distroState.urlDistro }) }))

afterEach(() => {
  distroState.urlDistro = null
})

function render(q: string, overrides: Partial<SearchResponse> = {}) {
  return renderToStaticMarkup(<SearchResultsClient distro="debian" q={q} section="" initial={{
    query: q, results: [], suggestions: [], hasMore: false, ...overrides,
  }} />)
}

describe('search result copy', () => {
  it('deep-links symbol definitions without labelling them command-line options', () => {
    const html = render('ForwardAgent', { results: [{ name: 'ssh_config', section: '5', title: 'ssh_config(5)', description: 'Client configuration', symbolKind: 'config', highlights: ['ForwardAgent'], anchorId: 'ForwardAgent' }] })
    expect(html).toContain('/man/ssh_config/5#ForwardAgent')
    expect(html).toContain('>directive</span>')
    expect(html).not.toContain('>options</span>')
  })
  it.each([['environment','environment'],['files','file'],['errors','errno'],['subcommand','subcommand']] as const)('renders the real %s symbol badge', (symbolKind,label) => {
    const html = render('term', {results:[{name:'example',section:'5',title:'example(5)',description:'Definition',symbolKind,highlights:['term'],anchorId:'term'}]})
    expect(html).toContain(`>${label}</span>`)
    expect(html).not.toContain('>options</span>')
  })
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

  it("carries the URL's explicit distro into result and correction links", () => {
    distroState.urlDistro = 'debian'
    const html = render('gti', {
      results: [{ name: 'git', section: '1', title: 'git(1)', description: 'content tracker', highlights: [], match: 'option', anchorId: 'version' }],
      suggestions: ['git'], correctedQuery: 'git',
    })
    expect(html).toContain('href="/man/git/1?distro=debian#version"')
    expect(html).toContain('href="/search?q=git&amp;distro=debian"')
  })
})
