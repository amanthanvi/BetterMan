import type { BlockNode, TocItem } from '../../lib/docModel'

/**
 * Book-style numbers for the page's sections: 1, 2, 2.1, 2.2, 3, … The
 * shallowest heading level numbers whole sections and the next level numbers
 * subsections. Deeper headings and subsections before any section are unnumbered.
 */
export function sectionNumbers(toc: TocItem[]): Map<string, string> {
  const out = new Map<string, string>()
  if (!toc.length) return out
  const top = Math.min(...toc.map((item) => item.level))
  let section = 0
  let subsection = 0
  for (const item of toc) {
    if (item.level === top) {
      section += 1
      subsection = 0
      out.set(item.id, String(section))
    } else if (item.level === top + 1 && section > 0) {
      subsection += 1
      out.set(item.id, `${section}.${subsection}`)
    }
  }
  return out
}

/** Locator per definition id: the number of the section the definition sits in. */
export function definitionLocators(blocks: BlockNode[], numbers: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  let current: string | undefined

  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'heading') {
        current = numbers.get(block.id) ?? current
      } else if (block.type === 'list') {
        for (const item of block.items) walk(item)
      } else if (block.type === 'definition_list') {
        for (const item of block.items) {
          if (item.id && current && !out.has(item.id)) out.set(item.id, current)
          walk(item.definitionBlocks)
        }
      }
    }
  }

  walk(blocks)
  return out
}
