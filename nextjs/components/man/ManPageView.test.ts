import { describe, expect, it } from 'vitest'

import type { BlockNode, TocItem } from '../../lib/docModel'
import { stripHeaderSections } from './ManPageView'

const h = (id: string, text: string, level = 2): BlockNode => ({ type: 'heading', id, text, level })
const p = (text: string): BlockNode => ({ type: 'paragraph', inlines: [{ type: 'text', text }] })

describe('stripHeaderSections', () => {
  const blocks: BlockNode[] = [
    h('name', 'NAME'),
    p('tar - an archiving utility'),
    h('synopsis', 'SYNOPSIS'),
    h('traditional-usage', 'Traditional usage', 3),
    p('tar {A|c|d|r|t|u|x}'),
    h('description', 'DESCRIPTION'),
    p('GNU tar is an archiving program.'),
  ]
  const toc: TocItem[] = [
    { id: 'name', title: 'NAME', level: 2 },
    { id: 'synopsis', title: 'SYNOPSIS', level: 2 },
    { id: 'traditional-usage', title: 'Traditional usage', level: 3 },
    { id: 'description', title: 'DESCRIPTION', level: 2 },
  ]

  it('drops NAME but keeps a SYNOPSIS that has subsections', () => {
    const out = stripHeaderSections(blocks, toc, { hasSynopsis: true })
    expect(out.blocks.map((b) => (b.type === 'heading' ? b.text : b.type))).toEqual([
      'SYNOPSIS',
      'Traditional usage',
      'paragraph',
      'DESCRIPTION',
      'paragraph',
    ])
    expect(out.toc.map((t) => t.id)).toEqual(['synopsis', 'traditional-usage', 'description'])
  })

  it('drops a bare one-line SYNOPSIS the header already shows', () => {
    const bare: BlockNode[] = [h('name', 'NAME'), p('ls - list'), h('synopsis', 'SYNOPSIS'), p('ls [OPTION]...'), h('description', 'DESCRIPTION'), p('Lists.')]
    const bareToc: TocItem[] = [
      { id: 'name', title: 'NAME', level: 2 },
      { id: 'synopsis', title: 'SYNOPSIS', level: 2 },
      { id: 'description', title: 'DESCRIPTION', level: 2 },
    ]
    const out = stripHeaderSections(bare, bareToc, { hasSynopsis: true })
    expect(out.toc.map((t) => t.id)).toEqual(['description'])
    expect(stripHeaderSections(bare, bareToc, { hasSynopsis: false }).toc.map((t) => t.id)).toEqual(['synopsis', 'description'])
  })
})
