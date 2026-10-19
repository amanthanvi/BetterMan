import type { BlockNode, CodeBlock, InlineNode } from './docModel'

export type ExampleSnippet = Pick<CodeBlock, 'text' | 'languageHint'> & { label: string | null }

const MAX_EXAMPLES = 5
const MAX_LABEL_LENGTH = 80
const MAX_SNIPPET_LINES = 10

/**
 * Short code blocks from the page's top-level EXAMPLES (or EXAMPLE) section.
 * Longer blocks are whole programs or config files, not commands, so they are
 * left to the full section. A label is the one-line paragraph or subsection
 * heading directly above a snippet in the same list item or definition. Any
 * other block, a list or definition item after the first, or the end of a list
 * or definition list clears a pending label.
 */
export function extractExamples(blocks: BlockNode[]): ExampleSnippet[] {
  const topLevel = Math.min(...blocks.flatMap((block) => (block.type === 'heading' ? [block.level] : [])))
  const examples: ExampleSnippet[] = []
  let sectionLevel: number | null = null
  let label: string | null = null

  for (const event of walkBlocks(blocks)) {
    switch (event.type) {
      case 'item_start':
        if (!event.first) label = null
        continue
      case 'container_end':
        label = null
        continue
      case 'block':
        break
      default: {
        const unreachable: never = event
        return unreachable
      }
    }
    const block = event.block

    if (sectionLevel === null) {
      if (block.type === 'heading' && block.level === topLevel && /^examples?$/i.test(block.text.trim())) {
        sectionLevel = block.level
      }
      continue
    }

    switch (block.type) {
      case 'heading':
        if (block.level <= sectionLevel) return examples
        label = shortLabel(block.text)
        break
      case 'paragraph':
        label = shortLabel(inlineText(block.inlines))
        break
      case 'code_block': {
        const text = trimBlankLines(block.text)
        if (text && text.split('\n').length <= MAX_SNIPPET_LINES) {
          // Copy display data only: the block id stays unique to the source section.
          examples.push({ label, text, languageHint: block.languageHint })
          if (examples.length === MAX_EXAMPLES) return examples
        }
        label = null
        break
      }
      case 'list':
        // Ingestion turns an indented region (troff .RS) into a one-item list, so
        // a paragraph above it still labels the code in its first item. Later
        // items and the end of the list drop the label.
        break
      case 'definition_list':
      case 'table':
      case 'horizontal_rule':
        // The container is yielded before its children, so a paragraph inside an
        // item can still label that item's code. item_start and container_end
        // drop a label that would otherwise cross an item or leave the container.
        label = null
        break
      default: {
        const unreachable: never = block
        return unreachable
      }
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

type WalkEvent =
  | { type: 'block'; block: BlockNode }
  | { type: 'item_start'; first: boolean }
  | { type: 'container_end' }

function* walkBlocks(blocks: BlockNode[]): Generator<WalkEvent> {
  for (const block of blocks) {
    yield { type: 'block', block }
    if (block.type === 'list') {
      for (const [index, item] of block.items.entries()) {
        yield { type: 'item_start', first: index === 0 }
        yield* walkBlocks(item)
      }
      yield { type: 'container_end' }
    } else if (block.type === 'definition_list') {
      for (const [index, item] of block.items.entries()) {
        yield { type: 'item_start', first: index === 0 }
        yield* walkBlocks(item.definitionBlocks)
      }
      yield { type: 'container_end' }
    }
  }
}

function inlineText(inlines: InlineNode[]): string {
  return inlines
    .map((inline) => (inline.type === 'text' || inline.type === 'code' ? inline.text : inlineText(inline.inlines)))
    .join('')
}
