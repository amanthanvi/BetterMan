import type { BlockNode, OptionItem } from '../../lib/docModel'

/** Every id the document body renders: headings, definition terms, and code blocks. */
export function collectBlockIds(blocks: BlockNode[], out = new Set<string>()): Set<string> {
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.add(block.id)
        break
      case 'code_block':
        if (block.id) out.add(block.id)
        break
      case 'list':
        for (const item of block.items) collectBlockIds(item, out)
        break
      case 'definition_list':
        for (const item of block.items) {
          if (item.id) out.add(item.id)
          collectBlockIds(item.definitionBlocks, out)
        }
        break
      case 'paragraph':
      case 'table':
      case 'horizontal_rule':
        break
      default: {
        const unhandled: never = block
        throw new Error(`Unhandled block: ${JSON.stringify(unhandled)}`)
      }
    }
  }
  return out
}

/**
 * The body's definition keeps the parser's `anchorId`, so `#anchorId` links land
 * on it. Each options-index row gets `opt-<anchorId>`, with `~2`, `~3`, … added
 * when the body or an earlier row already uses that id.
 */
export function optionRowIds(options: OptionItem[], bodyIds: ReadonlySet<string>): Map<string, string> {
  const used = new Set(bodyIds)
  const out = new Map<string, string>()
  for (const opt of options) {
    if (out.has(opt.anchorId)) continue
    const base = `opt-${opt.anchorId}`
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}~${n}`
    used.add(id)
    out.set(opt.anchorId, id)
  }
  return out
}
