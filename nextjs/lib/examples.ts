import type { BlockNode, CodeBlock, InlineNode } from './docModel'

export type ExampleSnippet = Pick<CodeBlock, 'text' | 'languageHint'> & { label: string | null }

const MAX_EXAMPLES = 5
const MAX_LABEL_LENGTH = 80
const MAX_SNIPPET_LINES = 10

/**
 * Short code blocks from the page's top-level EXAMPLES (or EXAMPLE) section.
 * Longer blocks are whole programs or config files, not commands, so they are
 * left to the full section. A label is the one-line paragraph or subsection
 * heading directly above a snippet.
 */
export function extractExamples(blocks: BlockNode[]): ExampleSnippet[] {
  const topLevel = Math.min(...blocks.flatMap((block) => (block.type === 'heading' ? [block.level] : [])))
  const examples: ExampleSnippet[] = []
  let sectionLevel: number | null = null
  let label: string | null = null

  for (const block of walkBlocks(blocks)) {
    if (sectionLevel === null) {
      if (block.type === 'heading' && block.level === topLevel && /^examples?$/i.test(block.text.trim())) {
        sectionLevel = block.level
      }
      continue
    }

    if (block.type === 'heading') {
      if (block.level <= sectionLevel) break
      label = shortLabel(block.text)
    } else if (block.type === 'paragraph') {
      label = shortLabel(inlineText(block.inlines))
    } else if (block.type === 'code_block') {
      const text = trimBlankLines(block.text)
      if (text && text.split('\n').length <= MAX_SNIPPET_LINES) {
        // Copy display data only: the block id stays unique to the source section.
        examples.push({ label, text, languageHint: block.languageHint })
        if (examples.length === MAX_EXAMPLES) break
      }
      label = null
    }
  }

  return examples
}

function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '')
}

function shortLabel(text: string): string | null {
  const trimmed = text.trim()
  return trimmed && trimmed.length <= MAX_LABEL_LENGTH && !trimmed.includes('\n') ? trimmed : null
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
  return inlines
    .map((inline) => (inline.type === 'text' || inline.type === 'code' ? inline.text : inlineText(inline.inlines)))
    .join('')
}
