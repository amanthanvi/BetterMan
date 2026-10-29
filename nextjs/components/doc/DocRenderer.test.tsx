import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode, InlineNode } from '../../lib/docModel'
import { DocRenderer } from './DocRenderer'

const paragraph = (...inlines: InlineNode[]): BlockNode[] => [{ type: 'paragraph', inlines }]
const text = (value: string): InlineNode => ({ type: 'text', text: value })
const render = (blocks: BlockNode[]) => renderToStaticMarkup(<DocRenderer blocks={blocks} urlDistro={null} />)

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
})

describe('DocRenderer cross-references', () => {
  const xref = paragraph({ type: 'link', linkType: 'internal', href: '/man/gzip/1', inlines: [text('gzip(1)')] })
  const hrefFor = (urlDistro: 'debian' | 'ubuntu' | null) =>
    renderToStaticMarkup(<DocRenderer blocks={xref} urlDistro={urlDistro} />).match(/href="([^"]+)"/)?.[1]

  it("carries the page URL's distro, Debian included, and stays bare on a bare page", () => {
    expect(hrefFor(null)).toBe('/man/gzip/1')
    expect(hrefFor('debian')).toBe('/man/gzip/1?distro=debian')
    expect(hrefFor('ubuntu')).toBe('/man/gzip/1?distro=ubuntu')
  })
})
