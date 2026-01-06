import type { BlockNode, InlineNode } from '../api/types'

export function countFindMatches(blocks: BlockNode[], query: string): number {
  const q = query.trim()
  if (q.length < 2) return 0

  const needle = q.toLowerCase()
  let count = 0

  const countInText = (text: string) => {
    const hay = text.toLowerCase()
    let idx = 0
    while (true) {
      const next = hay.indexOf(needle, idx)
      if (next === -1) break
      count += 1
      idx = next + needle.length
    }
  }

  const walkInlines = (inlines: InlineNode[]) => {
    for (const inline of inlines) {
      if (inline.type === 'text' || inline.type === 'code') {
        countInText(inline.text)
      } else if (inline.type === 'emphasis' || inline.type === 'strong') {
        walkInlines(inline.inlines)
      } else if (inline.type === 'link') {
        walkInlines(inline.inlines)
      }
    }
  }

  const walkBlocks = (bs: BlockNode[]) => {
    for (const b of bs) {
      switch (b.type) {
        case 'heading':
          countInText(b.text)
          break
        case 'paragraph':
          walkInlines(b.inlines)
          break
        case 'list':
          for (const item of b.items) walkBlocks(item)
          break
        case 'definition_list':
          for (const item of b.items) {
            walkInlines(item.termInlines)
            walkBlocks(item.definitionBlocks)
          }
          break
        case 'code_block':
          countInText(b.text)
          break
        case 'table':
          for (const h of b.headers) countInText(h)
          for (const row of b.rows) for (const cell of row) countInText(cell)
          break
        case 'horizontal_rule':
          break
      }
    }
  }

  walkBlocks(blocks)
  return count
}

export function parseOptionTerms(flags: string): string[] {
  const terms = flags
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => s.split(/\s+/g).map((x) => x.trim()))
    .filter(Boolean)
    .filter((t) => t.startsWith('-'))

  return Array.from(new Set(terms))
}

