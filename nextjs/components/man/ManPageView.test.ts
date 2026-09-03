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

  it('drops NAME and SYNOPSIS (including subsections) when the header shows a synopsis', () => {
    const out = stripHeaderSections(blocks, toc, { hasSynopsis: true })
    expect(out.blocks.map((b) => (b.type === 'heading' ? b.text : b.type))).toEqual(['DESCRIPTION', 'paragraph'])
    expect(out.toc.map((t) => t.id)).toEqual(['description'])
  })

  it('keeps SYNOPSIS in the body when the header has none to show', () => {
    const out = stripHeaderSections(blocks, toc, { hasSynopsis: false })
    expect(out.toc.map((t) => t.id)).toEqual(['synopsis', 'traditional-usage', 'description'])
  })
})
