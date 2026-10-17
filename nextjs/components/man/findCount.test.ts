import { describe, expect, it } from 'vitest'

import { countFindMatches } from './findCount'
import type { BlockNode } from '../../lib/docModel'

describe('countFindMatches', () => {
  it('counts matches across block types', () => {
    const blocks: BlockNode[] = [
      { type: 'heading', id: 'intro', level: 2, text: 'Tar overview' },
      {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: 'tar archives files and tar extracts files.' },
          { type: 'code', text: 'tar -xvf archive.tar' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'paragraph', inlines: [{ type: 'text', text: 'Use tar carefully.' }] }]],
      },
    ]

    expect(countFindMatches(blocks, 'tar')).toBe(6)
  })

  it('ignores short queries', () => {
    expect(countFindMatches([{ type: 'heading', id: 'intro', level: 2, text: 'A' }], 'a')).toBe(0)
  })
})
