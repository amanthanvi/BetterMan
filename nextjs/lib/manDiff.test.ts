import { describe, expect, it } from 'vitest'

import type { BlockNode, ManPageContent, OptionItem } from './docModel'
import { blockText, diffManContent } from './manDiff'

const paragraph = (text: string): BlockNode => ({ type: 'paragraph', inlines: [{ type: 'text', text }] })
const content = (blocks: BlockNode[], options: OptionItem[] = []): ManPageContent => ({ blocks, options, toc: [] })
const option = (flags: string, description: string): OptionItem => ({ flags, description, anchorId: flags })

describe('diffManContent', () => {
  it('ignores heading ids, inline formatting and option anchors', () => {
    const before = content([{ type: 'heading', id: 'old', level: 2, text: 'OPTIONS' }, paragraph('Archive.')], [option('-c', 'Create.')])
    const after = content([{ type: 'heading', id: 'new', level: 3, text: 'OPTIONS' }, { type: 'paragraph', inlines: [{ type: 'strong', inlines: [{ type: 'text', text: 'Archive.' }] }] }], [{ ...option('-c', 'Create.'), anchorId: 'new' }])
    expect(diffManContent(before, after)).toEqual({ added: [], removed: [], changed: [] })
  })

  it('aligns unchanged blocks around inserted and removed paragraphs', () => {
    expect(diffManContent(content([paragraph('a'), paragraph('b')]), content([paragraph('a'), paragraph('new'), paragraph('b')]))).toEqual({
      added: [{ area: 'Document', type: 'paragraph', after: 'new' }], removed: [], changed: [],
    })
    expect(diffManContent(content([paragraph('a'), paragraph('old'), paragraph('b')]), content([paragraph('a'), paragraph('b')]))).toEqual({
      added: [], removed: [{ area: 'Document', type: 'paragraph', before: 'old' }], changed: [],
    })
  })

  it('reports same-type replacement as changed and different types as removed and added', () => {
    expect(diffManContent(content([paragraph('old')]), content([paragraph('new')])).changed).toEqual([
      { area: 'Document', type: 'paragraph', before: 'old', after: 'new' },
    ])
    const diff = diffManContent(content([paragraph('same')]), content([{ type: 'code_block', text: 'same' }]))
    expect(diff.changed).toEqual([])
    expect(diff.added).toHaveLength(1)
    expect(diff.removed).toHaveLength(1)
  })

  it('matches options by flags independently of inserted flags and ordering', () => {
    const before = content([], [option('-a', 'Same.'), option('-b', 'Old.'), option('-c', 'Removed.')])
    const after = content([], [option('-b', 'New.'), option('-aa', 'Added.'), option('-a', 'Same.')])
    expect(diffManContent(before, after)).toEqual({
      added: [{ area: 'Options', type: '-aa', after: '-aa\nAdded.' }],
      removed: [{ area: 'Options', type: '-c', before: '-c\nRemoved.' }],
      changed: [{ area: 'Options', type: '-b', before: '-b\nOld.', after: '-b\nNew.' }],
    })
  })

  it('handles empty content, duplicate blocks and duplicate flags without dropping entries', () => {
    const before = content([paragraph('same'), paragraph('same')], [option('-a', 'First.'), option('-a', 'Second.')])
    expect(diffManContent(before, before)).toEqual({ added: [], removed: [], changed: [] })
    const out = diffManContent(before, content([]))
    expect(out.removed).toHaveLength(4)
    expect(diffManContent(content([]), before).added).toHaveLength(4)
  })

  it('ignores reordering of distinct descriptions under the same flags', () => {
    const before = content([], [option('-a', 'First.'), option('-a', 'Second.')])
    const after = content([], [option('-a', 'Second.'), option('-a', 'First.')])
    expect(diffManContent(before, after)).toEqual({ added: [], removed: [], changed: [] })
  })

  it('adds a new duplicate-flag description without consuming unchanged options', () => {
    const before = content([], [option('-a', 'First.'), option('-a', 'Second.')])
    const after = content([], [option('-a', 'New.'), option('-a', 'First.'), option('-a', 'Second.')])
    expect(diffManContent(before, after)).toEqual({
      added: [{ area: 'Options', type: '-a', after: '-a\nNew.' }], removed: [], changed: [],
    })
    expect(diffManContent(after, before)).toEqual({
      added: [], removed: [{ area: 'Options', type: '-a', before: '-a\nNew.' }], changed: [],
    })
  })

  it('preserves identical option multiplicity and pairs only unmatched duplicate descriptions', () => {
    const before = content([], [option('-a', 'Same.'), option('-a', 'Old.'), option('-a', 'Same.')])
    const after = content([], [option('-a', 'New.'), option('-a', 'Same.')])
    expect(diffManContent(before, after)).toEqual({
      added: [],
      removed: [{ area: 'Options', type: '-a', before: '-a\nSame.' }],
      changed: [{ area: 'Options', type: '-a', before: '-a\nOld.', after: '-a\nNew.' }],
    })
  })

  it('matches a large duplicate-flag bucket without repeated array scans or shifts', () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => option('-a', `Description ${index}`))
    const before = content([], entries)
    const after = content([], [option('-a', 'New.'), ...[...entries].reverse()])
    expect(diffManContent(before, after)).toEqual({
      added: [{ area: 'Options', type: '-a', after: '-a\nNew.' }], removed: [], changed: [],
    })
  })

  it.each([
    { before: ['A', 'B', 'A'], after: ['A', 'A', 'B', 'A'], inserted: 'A' },
    { before: ['A', 'B', 'A'], after: ['A', 'B', 'B', 'A'], inserted: 'B' },
    { before: ['prefix', 'A', 'B', 'A', 'suffix'], after: ['prefix', 'A', 'A', 'B', 'A', 'suffix'], inserted: 'A' },
  ])('keeps unchanged repeated blocks aligned around an insertion: %j', ({ before, after, inserted }) => {
    expect(diffManContent(content(before.map(paragraph)), content(after.map(paragraph)))).toEqual({
      added: [{ area: 'Document', type: 'paragraph', after: inserted }], removed: [], changed: [],
    })
    expect(diffManContent(content(after.map(paragraph)), content(before.map(paragraph)))).toEqual({
      added: [], removed: [{ area: 'Document', type: 'paragraph', before: inserted }], changed: [],
    })
  })

  it('aligns duplicate insertions even when the prefix and suffix both change', () => {
    const before = ['Old prefix', 'A', 'B', 'A', 'Old suffix']
    const after = ['New prefix', 'A', 'A', 'B', 'A', 'New suffix']
    expect(diffManContent(content(before.map(paragraph)), content(after.map(paragraph)))).toEqual({
      added: [{ area: 'Document', type: 'paragraph', after: 'A' }], removed: [],
      changed: [
        { area: 'Document', type: 'paragraph', before: 'Old prefix', after: 'New prefix' },
        { area: 'Document', type: 'paragraph', before: 'Old suffix', after: 'New suffix' },
      ],
    })
  })

  it('reports only the inserted block across repeated short sequences with distinct context', () => {
    for (let pattern = 0; pattern < 32; pattern++) {
      const blocks = Array.from({ length: 5 }, (_, index) => (pattern & (1 << index)) ? 'A' : 'B')
      for (let position = 0; position <= blocks.length; position++) {
        for (const inserted of ['A', 'B']) {
          const before = ['Prefix', ...blocks, 'Suffix']
          const after = ['Prefix', ...blocks.slice(0, position), inserted, ...blocks.slice(position), 'Suffix']
          const diff = diffManContent(content(before.map(paragraph)), content(after.map(paragraph)))
          expect(diff.added).toEqual([{ area: 'Document', type: 'paragraph', after: inserted }])
          expect(diff.removed).toEqual([])
          expect(diff.changed).toEqual([])
        }
      }
    }
  })

  it('handles a long repeated document with changed ends and a duplicate insertion', () => {
    const repeated = Array.from({ length: 10_000 }, (_, index) => paragraph(index % 2 ? 'B' : 'A'))
    const before = content([paragraph('Old prefix'), ...repeated, paragraph('Old suffix')])
    const after = content([paragraph('New prefix'), ...repeated.slice(0, 5000), paragraph('A'), ...repeated.slice(5000), paragraph('New suffix')])
    const diff = diffManContent(before, after)
    expect(diff.added).toEqual([{ area: 'Document', type: 'paragraph', after: 'A' }])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toHaveLength(2)
  })

  it('retains unique anchors when large rewrites exceed bounded edit alignment', () => {
    const before = content([...Array.from({ length: 100 }, (_, index) => paragraph(`Old ${index}`)), paragraph('Stable'), ...Array.from({ length: 100 }, (_, index) => paragraph(`Before ${index}`))])
    const after = content([...Array.from({ length: 100 }, (_, index) => paragraph(`New ${index}`)), paragraph('Stable'), ...Array.from({ length: 100 }, (_, index) => paragraph(`After ${index}`))])
    const diff = diffManContent(before, after)
    expect(diff.changed).toHaveLength(200)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed.some((entry) => entry.before === 'Stable' || entry.after === 'Stable')).toBe(false)
  })

  it('includes nested lists, definitions, tables and code in readable comparison text', () => {
    const nested: BlockNode = { type: 'definition_list', items: [{ termInlines: [{ type: 'code', text: '-a' }], definitionBlocks: [{ type: 'list', ordered: false, items: [[paragraph('Nested.')]] }] }] }
    expect(blockText(nested)).toBe('-a\nNested.')
    expect(blockText({ type: 'table', headers: ['Flag', 'Meaning'], rows: [['-a', 'All']] })).toBe('Flag\tMeaning\n-a\tAll')
    expect(blockText({ type: 'code_block', text: 'tar -cf archive.tar .\n' })).toBe('tar -cf archive.tar .\n')
    expect(blockText({ type: 'horizontal_rule' })).toBe('—')
  })

  it('handles a long document without quadratic alignment storage', () => {
    const blocks = Array.from({ length: 10_000 }, (_, index) => paragraph(`Line ${index}`))
    const after = [...blocks.slice(0, 5000), paragraph('Inserted.'), ...blocks.slice(5000)]
    const diff = diffManContent(content(blocks), content(after))
    expect(diff.added).toEqual([{ area: 'Document', type: 'paragraph', after: 'Inserted.' }])
    expect(diff.changed).toEqual([])
  })
})
