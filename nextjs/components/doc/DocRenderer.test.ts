import { describe, expect, it } from 'vitest'

import type { BlockNode } from '../../lib/docModel'
import { shouldVirtualizeBlocks } from './DocRenderer'

function paragraphs(count: number): BlockNode[] {
  return Array.from({ length: count }, () => ({ type: 'paragraph', inlines: [] }) as BlockNode)
}

function codeBlocks(count: number): BlockNode[] {
  const text = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n')
  return Array.from({ length: count }, () => ({ type: 'code_block', text }) as BlockNode)
}

describe('shouldVirtualizeBlocks', () => {
  it('keeps short documents eager', () => {
    expect(shouldVirtualizeBlocks(paragraphs(59))).toBe(false)
    expect(shouldVirtualizeBlocks(paragraphs(60))).toBe(false)
  })

  it('virtualizes tall documents below the block-count ceiling', () => {
    expect(shouldVirtualizeBlocks(codeBlocks(60))).toBe(true)
  })

  it('always virtualizes documents at the block-count ceiling', () => {
    expect(shouldVirtualizeBlocks(paragraphs(100))).toBe(true)
  })
})
