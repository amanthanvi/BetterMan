import type { BlockNode, InlineNode } from '../../lib/docModel'

/** Count case-insensitive, non-overlapping matches of the find query. */
export function countFindMatches(blocks: BlockNode[], query: string): number {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return 0
  return countInBlocks(blocks, needle)
}

function countInBlock(block: BlockNode, needle: string): number {
  switch (block.type) {
    case 'heading':
      return countInText(block.text, needle)
    case 'paragraph':
      return countInInlines(block.inlines, needle)
    case 'list':
      return block.items.reduce((sum, item) => sum + countInBlocks(item, needle), 0)
    case 'definition_list':
      return block.items.reduce((sum, item) => sum + countInInlines(item.termInlines, needle) + countInBlocks(item.definitionBlocks, needle), 0)
    case 'code_block':
      return countInText(block.text, needle)
    case 'table': {
      let sum = 0
      for (const h of block.headers) sum += countInText(h, needle)
      for (const row of block.rows) for (const cell of row) sum += countInText(cell, needle)
      return sum
    }
    case 'horizontal_rule':
      return 0
  }
}

function countInBlocks(blocks: BlockNode[], needle: string): number {
  return blocks.reduce((sum, block) => sum + countInBlock(block, needle), 0)
}

function countInInlines(inlines: InlineNode[], needle: string): number {
  return inlines.reduce((sum, inline) => {
    if (inline.type === 'text' || inline.type === 'code') return sum + countInText(inline.text, needle)
    if (inline.type === 'emphasis' || inline.type === 'strong') return sum + countInInlines(inline.inlines, needle)
    if (inline.type === 'link') return sum + countInInlines(inline.inlines, needle)
    return sum
  }, 0)
}

function countInText(text: string, needle: string): number {
  const hay = text.toLowerCase()
  let idx = 0
  let count = 0
  while (true) {
    const next = hay.indexOf(needle, idx)
    if (next === -1) break
    count += 1
    idx = next + needle.length
  }
  return count
}

