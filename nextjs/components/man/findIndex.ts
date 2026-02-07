import type { BlockNode, InlineNode } from '../../lib/docModel'

export type FindIndex = {
  prefixByBlock: number[]
  total: number
}

export type FindLocation = {
  blockIndex: number
  withinBlockIndex: number
}

export function buildFindIndex(blocks: BlockNode[], query: string): FindIndex {
  const q = query.trim()
  if (q.length < 2) return { prefixByBlock: new Array(blocks.length).fill(0), total: 0 }

  const needle = q.toLowerCase()
  const prefixByBlock = new Array<number>(blocks.length)
  let total = 0

  for (let idx = 0; idx < blocks.length; idx += 1) {
    total += countInBlock(blocks[idx]!, needle)
    prefixByBlock[idx] = total
  }

  return { prefixByBlock, total }
}

export function locateFindMatch(prefixByBlock: number[], matchIndex: number): FindLocation | null {
  if (!prefixByBlock.length) return null

  const target = matchIndex + 1
  let lo = 0
  let hi = prefixByBlock.length - 1
  let ans = -1

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const v = prefixByBlock[mid]!
    if (v >= target) {
      ans = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }

  if (ans < 0) return null
  const prev = ans === 0 ? 0 : prefixByBlock[ans - 1]!
  return { blockIndex: ans, withinBlockIndex: matchIndex - prev }
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

