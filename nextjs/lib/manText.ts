import { sectionLabel } from '../components/man/RunningHead'
import type { Distro } from './distro'
import { tEnglish } from './i18n/english'
import type { BlockNode, InlineNode, ManPageResponse } from './docModel'

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => 'text' in node ? node.text : inlineText(node.inlines)).join('')
}

function indent(text: string): string {
  return text.split('\n').map((line) => line ? `    ${line}` : '').join('\n')
}

function blocksText(blocks: BlockNode[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading': return block.text
      case 'paragraph': return inlineText(block.inlines)
      case 'code_block': return block.text
      case 'horizontal_rule': return '--------'
      case 'table': return [block.headers, ...block.rows].map((row) => row.join('  |  ')).join('\n')
      case 'definition_list':
        return block.items.map((item) => `${inlineText(item.termInlines)}\n${indent(blocksText(item.definitionBlocks))}`).join('\n\n')
      case 'list':
        return block.items.map((item, index) => {
          const [first, ...rest] = blocksText(item).split('\n')
          return `${block.ordered ? `${index + 1}.` : '-'} ${first}${rest.length ? `\n${indent(rest.join('\n'))}` : ''}`
        }).join('\n')
    }
  }).join('\n\n')
}

/** Render the faithful document, filling extracted sections only when absent from its blocks. */
export function renderManText({ page, content }: ManPageResponse, distro?: Distro): string {
  const title = `${page.name.toUpperCase()}(${page.section})`
  const headings = new Set(content.blocks.filter((block) => block.type === 'heading').map((block) => block.text.trim().toUpperCase()))
  const sections: string[] = []
  if (!headings.has('NAME')) sections.push(`NAME\n${page.name} - ${page.description || page.title}`)
  if (!headings.has('SYNOPSIS') && content.synopsis?.length) sections.push(`SYNOPSIS\n${content.synopsis.join('\n')}`)
  const body = blocksText(content.blocks)
  // Pages like help2man's `ls` describe their options under DESCRIPTION, with no OPTIONS heading; filling then
  // would print the list ahead of NAME and again in the body, so fill only when the body lacks the flags.
  if (!headings.has('OPTIONS') && content.options?.length && !content.options.every((option) => body.includes(option.flags))) {
    sections.push(`OPTIONS\n${content.options.map((option) => `${option.flags}${option.argument ? ` ${option.argument}` : ''}\n${indent(option.description)}`).join('\n\n')}`)
  }
  sections.push(body)
  // Terminals must never interpret corpus text as C0/C1 control sequences.
  return `${title}        ${sectionLabel(page.section, tEnglish, distro)}        ${title}\n\n${sections.filter(Boolean).join('\n\n')}\n`
    .replace(/\p{Cc}/gu, (character) => character === '\n' || character === '\t' ? character : '')
}
