/**
 * Renders the parser goldens through DocRenderer.
 *
 * The JSON under `__fixtures__` is copied verbatim from
 * `ingestion/tests/fixtures/golden`. If the Python document model changes
 * shape, this test fails to type-check or render before anything ships.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode, InlineNode, OptionItem, SeeAlsoRef, TocItem } from '../../lib/docModel'
import { DocRenderer } from './DocRenderer'

type Golden =
  | { alias: { target: [string, string] | null; raw: string } }
  | {
      description: string
      synopsis: string[] | null
      seeAlso: SeeAlsoRef[]
      options: OptionItem[]
      doc: { toc: TocItem[]; blocks: BlockNode[] }
    }

const dir = join(__dirname, '__fixtures__')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

const BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'list',
  'definition_list',
  'code_block',
  'table',
  'horizontal_rule',
])
const INLINE_TYPES = new Set(['text', 'code', 'emphasis', 'strong', 'link'])

function walkBlocks(blocks: BlockNode[]) {
  for (const block of blocks) {
    expect(BLOCK_TYPES.has(block.type)).toBe(true)
    if (block.type === 'paragraph') walkInlines(block.inlines)
    if (block.type === 'list') block.items.forEach((item) => walkBlocks(item))
    if (block.type === 'definition_list') {
      for (const item of block.items) {
        walkInlines(item.termInlines)
        walkBlocks(item.definitionBlocks)
      }
    }
  }
}

function walkInlines(inlines: InlineNode[]) {
  for (const inline of inlines) walkInline(inline)
}

function walkInline(inline: InlineNode) {
  expect(INLINE_TYPES.has(inline.type)).toBe(true)
  if (inline.type === 'emphasis' || inline.type === 'strong' || inline.type === 'link') {
    for (const child of inline.inlines) walkInline(child)
  }
}

describe('DocRenderer goldens', () => {
  for (const file of files) {
    it(`renders ${file}`, () => {
      const golden = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Golden
      if ('alias' in golden) {
        expect(golden.alias.target).not.toBeNull()
        return
      }

      walkBlocks(golden.doc.blocks)

      const html = renderToStaticMarkup(<DocRenderer blocks={golden.doc.blocks} distro="debian" />)
      expect(html.length).toBeGreaterThan(200)
      for (const item of golden.doc.toc) {
        expect(item.title).not.toMatch(/\n/)
        expect(html).toContain(`id="${item.id}"`)
      }
      for (const link of golden.seeAlso) {
        expect(link.name).toMatch(/^[a-z0-9_.+:-]+$/)
      }
    })
  }

  it('tar(1) has cross-reference links and a populated SEE ALSO', () => {
    const golden = JSON.parse(readFileSync(join(dir, 'tar.1.json'), 'utf8')) as Exclude<Golden, { alias: unknown }>
    const html = renderToStaticMarkup(<DocRenderer blocks={golden.doc.blocks} distro="debian" />)
    expect(html).toContain('href="/man/gzip/1"')
    expect(golden.seeAlso.map((r) => r.name)).toContain('gzip')
    expect(golden.doc.toc.map((t) => t.title)).toContain('SEE ALSO')
  })

  it('ascii(7) table renders a header row', () => {
    const golden = JSON.parse(readFileSync(join(dir, 'ascii.7.json'), 'utf8')) as Exclude<Golden, { alias: unknown }>
    const html = renderToStaticMarkup(<DocRenderer blocks={golden.doc.blocks} distro="debian" />)
    expect(html).toMatch(/<th[^>]*>Oct<\/th>/)
  })
})
