import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { BlockNode, OptionItem } from './docModel'
import { briefFlagGroups, definitionHeadings, isModeHeading } from './manBrief'

// The parser's golden fixtures: real manuals, as ingestion turns them into the document model.
function fixture(name: string): { blocks: BlockNode[]; options: OptionItem[] } {
  const raw = JSON.parse(readFileSync(join(__dirname, '../components/doc/__fixtures__', name), 'utf8')) as { doc: { blocks: BlockNode[] }; options?: OptionItem[] }
  return { blocks: raw.doc.blocks, options: raw.options ?? [] }
}

function modeHeadings(name: string): string[] {
  return [...new Set([...definitionHeadings(fixture(name).blocks).values()])].filter(isModeHeading)
}

describe('mode headings', () => {
  it('takes only whole headings that name exclusive modes', () => {
    for (const heading of ['Operation mode', 'OPERATION MODES', 'Main operation mode:', 'Modes of operation', 'OPERATIONS']) expect(isModeHeading(heading)).toBe(true)
    for (const heading of ['Operation modifiers', 'COMMANDS', 'ACTIONS', 'FUNCTIONS', 'Modes', 'OPTIONS', 'File operations', 'Compatibility mode (compat)']) expect(isModeHeading(heading)).toBe(false)
  })

  it('finds tar(1)\'s operation mode and not its operation modifiers', () => {
    expect(modeHeadings('tar.1.json')).toEqual(['Operation mode'])
  })

  it('finds no modes in pages whose commands, actions or functions combine', () => {
    for (const name of ['git-commit.1.json', 'systemctl-options.1.json', 'mount-options.8.json', 'find-name.1.json', 'ls.1.json', 'generated-options-negative.1.json']) expect(modeHeadings(name), name).toEqual([])
  })
})

describe('most-used flags on the real tar(1)', () => {
  const { blocks, options } = fixture('tar.1.json')
  const used = (flags: Array<[string, string]>) => ({ source: 'verified-frequency' as const, flags: flags.map(([flag, anchorId], i) => ({ flag, anchorId, count: 10 - i, sources: ['tldr' as const] })) })

  it('puts -c under one mode and -g, -f under then add', () => {
    const groups = briefFlagGroups(used([['-c', 'c'], ['-g', 'g'], ['-f', 'f']]), options, blocks)
    expect(groups.map((group) => [group.label, group.flags.map((f) => f.flag)])).toEqual([
      ['One mode', ['-c']],
      ['Then add', ['-g', '-f']],
    ])
  })

  it('does not group when only modifiers are used', () => {
    expect(briefFlagGroups(used([['-g', 'g'], ['-f', 'f']]), options, blocks)).toEqual([{ label: null, flags: expect.any(Array) }])
  })
})
