import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode, InlineNode } from '../../lib/docModel'
import { DocRenderer } from './DocRenderer'

const DEBIAN = { distro: 'debian', preferred: 'debian' } as const

const paragraph = (...inlines: InlineNode[]): BlockNode[] => [{ type: 'paragraph', inlines }]
const text = (value: string): InlineNode => ({ type: 'text', text: value })
const render = (blocks: BlockNode[], props: { findQuery?: string; optionTerms?: string[] } = {}) =>
  renderToStaticMarkup(<DocRenderer blocks={blocks} link={DEBIAN} {...props} />)

describe('DocRenderer plain-text URLs', () => {
  it('links validated URLs in text and table cells as external links', () => {
    const html = render([
      ...paragraph(text('Report bugs at https://www.gnu.org/software/tar/. Not http://host/.')),
      { type: 'table', headers: ['Site'], rows: [['https://curl.se/docs/']] },
    ])
    expect(html).toContain('<a href="https://www.gnu.org/software/tar/" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('<a href="https://curl.se/docs/"')
    expect(html).not.toContain('href="http://host/"')
    expect(html).toContain('</a><span>. Not http://host/.</span>')
  })

  it('does not nest links inside existing links', () => {
    const html = render(
      paragraph(
        { type: 'link', linkType: 'external', href: 'https://example.org/', inlines: [text('https://example.org/')] },
        { type: 'link', linkType: 'internal', href: '/man/curl/1', inlines: [text('see https://curl.se/')] },
      ),
    )
    expect(html.match(/<a /g)).toHaveLength(2)
  })

  it('keeps find marks inside a linked URL', () => {
    const html = render(paragraph(text('Docs: https://www.gnu.org/software/tar/ for tar.')), { findQuery: 'tar' })
    expect(html).toMatch(/<a href="https:\/\/www\.gnu\.org\/software\/tar\/"[^>]*><span>https:\/\/www\.gnu\.org\/software\/<\/span><mark data-bm-find/)
    expect(html.match(/data-bm-find/g)).toHaveLength(2)
  })
})

describe('DocRenderer cross-references', () => {
  const xref = paragraph({ type: 'link', linkType: 'internal', href: '/man/gzip/1', inlines: [text('gzip(1)')] })
  const hrefFor = (link: { distro: 'debian' | 'ubuntu'; preferred: 'debian' | 'ubuntu' }) =>
    renderToStaticMarkup(<DocRenderer blocks={xref} link={link} />).match(/href="([^"]+)"/)?.[1]

  it('keeps the reading context distro, including Debian when the stored default differs', () => {
    expect(hrefFor({ distro: 'debian', preferred: 'debian' })).toBe('/man/gzip/1')
    expect(hrefFor({ distro: 'debian', preferred: 'ubuntu' })).toBe('/man/gzip/1?distro=debian')
    expect(hrefFor({ distro: 'ubuntu', preferred: 'ubuntu' })).toBe('/man/gzip/1?distro=ubuntu')
  })
})

describe('DocRenderer option marks', () => {
  it('marks a selected flag only at token boundaries', () => {
    const html = render(paragraph(text('Use -e here; a non-existent file, --exclude and -exec are other things.')), {
      optionTerms: ['-e'],
    })
    expect([...html.matchAll(/<mark data-bm-opt[^>]*>([^<]*)<\/mark>/g)].map((m) => m[1])).toEqual(['-e'])
    expect(html).toContain('non-existent')
    expect(html).toContain('--exclude')
  })
})
