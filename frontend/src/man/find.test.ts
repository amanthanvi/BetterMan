import { describe, expect, it } from 'vitest'

import { countFindMatches, parseOptionTerms } from './find'
import type { BlockNode } from '../api/types'

describe('countFindMatches', () => {
  it('counts matches across the document model (case-insensitive)', () => {
    const blocks: BlockNode[] = [
      { type: 'heading', id: 'h', level: 2, text: 'SYNOPSIS' },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Tar tarball' }] },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'paragraph', inlines: [{ type: 'text', text: 'use tar to create tar archives' }] }]],
      },
      {
        type: 'definition_list',
        items: [
          {
            termInlines: [{ type: 'code', text: 'tar' }],
            definitionBlocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'tar extracts' }] }],
          },
        ],
      },
      { type: 'code_block', text: 'tar -xvf /tmp/tar' },
      { type: 'table', headers: ['tar'], rows: [['TAR', 'untar'], ['nope', '']] },
    ]

    expect(countFindMatches(blocks, 'tar')).toBe(11)
  })

  it('returns 0 for short queries', () => {
    const blocks: BlockNode[] = [{ type: 'heading', id: 'h', level: 2, text: 'tar' }]
    expect(countFindMatches(blocks, 't')).toBe(0)
  })
})

describe('parseOptionTerms', () => {
  it('extracts unique flag-like terms', () => {
    expect(parseOptionTerms('-r, --recursive FILE, -r')).toEqual(['-r', '--recursive'])
  })
})
