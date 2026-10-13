import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode } from '../../lib/docModel'
import { BlockView, buildOptionRegex } from './BlockView'
import { ServerDoc } from './ServerDoc'

describe('server document', () => {
  it('keeps every block and nested anchor in the initial HTML of a long document', () => {
    const blocks: BlockNode[] = Array.from({ length: 150 }, (_, index) => ({
      type: 'heading', id: `section-${index}`, level: 2, text: `Section ${index}`,
    }))
    blocks.push({ type: 'definition_list', items: [{
      id: 'last-option', termInlines: [{ type: 'code', text: '--last' }],
      definitionBlocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Last definition' }] }],
    }] })
    const html = renderToStaticMarkup(<ServerDoc blocks={blocks} distro="debian" />)
    expect(html.match(/data-bm-block=/g)).toHaveLength(151)
    for (let index = 0; index < 150; index++) expect(html).toContain(`id="section-${index}"`)
    expect(html).toContain('id="last-option"')
    expect(html).not.toContain('translateY')
    expect(html).not.toContain('data-bm-find')
  })

  it('shares pure highlight semantics with find taking priority over options', () => {
    const html = renderToStaticMarkup(<BlockView
      block={{ type: 'paragraph', inlines: [{ type: 'text', text: '--create tar --create' }] }}
      distro="debian"
      ctx={{ findRegex: /tar/gi, optionRegex: buildOptionRegex(['tar', '--create']) }}
    />)
    expect(html.match(/data-bm-find=/g)).toHaveLength(1)
    expect(html.match(/data-bm-opt=/g)).toHaveLength(2)
  })

  it('preserves distro cross-references and rejects unsafe external URLs', () => {
    const html = renderToStaticMarkup(<ServerDoc distro="ubuntu" blocks={[{
      type: 'paragraph', inlines: [
        { type: 'link', linkType: 'internal', href: '/man/gzip/1', inlines: [{ type: 'text', text: 'gzip' }] },
        { type: 'link', linkType: 'external', href: 'javascript:alert(1)', inlines: [{ type: 'text', text: 'unsafe' }] },
      ],
    }]} />)
    expect(html).toContain('href="/man/gzip/1?distro=ubuntu"')
    expect(html).not.toContain('javascript:')
  })
})
