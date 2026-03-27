import { describe, expect, it } from 'vitest'

import { buildFindIndex, locateFindMatch } from './findIndex'
import type { BlockNode } from '../../lib/docModel'

describe('buildFindIndex', () => {
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

    const index = buildFindIndex(blocks, 'tar')

    expect(index.total).toBe(6)
    expect(index.prefixByBlock).toEqual([1, 5, 6])
  })

  it('returns an empty index for short queries', () => {
    const index = buildFindIndex([{ type: 'heading', id: 'intro', level: 2, text: 'A' }], 'a')

    expect(index.total).toBe(0)
    expect(index.prefixByBlock).toEqual([0])
  })
})

describe('locateFindMatch', () => {
  it('maps flat match indexes back to block positions', () => {
    const prefixByBlock = [2, 5, 5, 8]

    expect(locateFindMatch(prefixByBlock, 0)).toEqual({ blockIndex: 0, withinBlockIndex: 0 })
    expect(locateFindMatch(prefixByBlock, 1)).toEqual({ blockIndex: 0, withinBlockIndex: 1 })
    expect(locateFindMatch(prefixByBlock, 2)).toEqual({ blockIndex: 1, withinBlockIndex: 0 })
    expect(locateFindMatch(prefixByBlock, 6)).toEqual({ blockIndex: 3, withinBlockIndex: 1 })
  })

  it('returns null when there are no blocks', () => {
    expect(locateFindMatch([], 0)).toBeNull()
  })
})
