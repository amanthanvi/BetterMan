import type { BlockNode, HeadingBlock, TocItem } from '../../lib/docModel'

/**
 * The header shows NAME and the extracted synopsis lines. Drop NAME from the
 * body always. Drop SYNOPSIS only when it holds nothing the header lacks: a
 * single paragraph or code block and no subsections. tar(1) keeps its
 * "Traditional usage" subsections in the body.
 */
export function stripHeaderSections(
  blocks: BlockNode[],
  toc: TocItem[],
  opts: { hasSynopsis: boolean },
): { blocks: BlockNode[]; toc: TocItem[] } {
  const sections = splitSections(blocks)
  const removed = new Set<string>()
  const outBlocks: BlockNode[] = []

  for (const section of sections) {
    const title = section.heading?.text.trim().toUpperCase()
    const drop =
      title === 'NAME' ||
      (title === 'SYNOPSIS' && opts.hasSynopsis && isBareSynopsis(section.heading!.level, section.body))
    if (drop) {
      for (const block of [section.heading!, ...section.body]) {
        if (block.type === 'heading') removed.add(block.id)
      }
      continue
    }
    if (section.heading) outBlocks.push(section.heading)
    outBlocks.push(...section.body)
  }

  return { blocks: outBlocks, toc: toc.filter((item) => !removed.has(item.id)) }
}

type Section = { heading: HeadingBlock | null; body: BlockNode[] }

/** Group blocks under their nearest top-level heading. */
function splitSections(blocks: BlockNode[]): Section[] {
  const out: Section[] = []
  let current: Section = { heading: null, body: [] }
  let topLevel: number | null = null

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (topLevel === null) topLevel = block.level
      if (block.level <= topLevel) {
        if (current.heading || current.body.length) out.push(current)
        current = { heading: block, body: [] }
        continue
      }
    }
    current.body.push(block)
  }
  if (current.heading || current.body.length) out.push(current)
  return out
}

function isBareSynopsis(level: number, body: BlockNode[]): boolean {
  if (body.some((b) => b.type === 'heading' && b.level > level)) return false
  const content = body.filter((b) => b.type === 'paragraph' || b.type === 'code_block')
  return body.length === content.length && content.length <= 1
}

