import type { BlockNode, CodeBlock, InlineNode } from './docModel'

export type ExampleSnippet = Pick<CodeBlock, 'text' | 'languageHint'> & { label: string | null }

/** A preview of the first EXAMPLES section; the document keeps its source anchors. */
export function extractExamples(blocks: BlockNode[]): ExampleSnippet[] {
  const examples: ExampleSnippet[] = []
  let sectionLevel: number | null = null
  let label: string | null = null

  for (const block of walkBlocks(blocks)) {
    if (sectionLevel === null) {
      if (block.type === 'heading' && block.text.trim().toUpperCase() === 'EXAMPLES') {
        sectionLevel = block.level
      }
      continue
    }

    if (block.type === 'heading' && block.level <= sectionLevel) break
    if (block.type === 'paragraph') label = inlineText(block.inlines).trim() || null
    if (block.type === 'code_block') {
      // Select only display data: copying an id here would duplicate source anchors.
      examples.push({ label, text: block.text, languageHint: block.languageHint })
      if (examples.length === 5) break
    }
  }

  return examples
}

function* walkBlocks(blocks: BlockNode[]): Generator<BlockNode> {
  for (const block of blocks) {
    yield block
    if (block.type === 'list') {
      for (const item of block.items) yield* walkBlocks(item)
    } else if (block.type === 'definition_list') {
      for (const item of block.items) yield* walkBlocks(item.definitionBlocks)
    }
  }
}

function inlineText(inlines: InlineNode[]): string {
  return inlines.map((inline) => (
    inline.type === 'text' || inline.type === 'code' ? inline.text : inlineText(inline.inlines)
  )).join('')
}
