import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode, OptionItem } from '../../lib/docModel'
import { DocRenderer } from '../doc/DocRenderer'
import { OptionsTable } from './OptionsTable'
import { collectBlockIds, optionRowIds } from './optionAnchors'

const dir = join(__dirname, '../doc/__fixtures__')
const goldens = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((file) => ({ file, golden: JSON.parse(readFileSync(join(dir, file), 'utf8')) }))
  .filter((g): g is { file: string; golden: { options: OptionItem[]; doc: { blocks: BlockNode[] } } } => 'doc' in g.golden)

function renderedIds(options: OptionItem[], blocks: BlockNode[]): string[] {
  const rowIds = optionRowIds(options, collectBlockIds(blocks))
  const html = renderToStaticMarkup(
    <>
      <OptionsTable options={options} rowIds={rowIds} />
      <DocRenderer blocks={blocks} distro="debian" />
    </>,
  )
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
}

describe('option anchors', () => {
  it('covers the option-heavy goldens', () => {
    expect(goldens.map((g) => g.file)).toEqual(expect.arrayContaining(['tar.1.json', 'ssh_config.5.json', 'ls.1.json']))
    expect(goldens.find((g) => g.file === 'tar.1.json')?.golden.options.length).toBeGreaterThan(50)
  })

  for (const { file, golden } of goldens) {
    it(`${file}: the options index and body render no duplicate ids`, () => {
      const ids = renderedIds(golden.options, golden.doc.blocks)
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    })

    it(`${file}: body definitions keep the parser's anchor ids`, () => {
      const ids = new Set(renderedIds(golden.options, golden.doc.blocks))
      for (const opt of golden.options) expect(ids.has(opt.anchorId)).toBe(true)
    })
  }

  it('suffixes row ids that collide with the body or an earlier row', () => {
    const option = (anchorId: string): OptionItem => ({ anchorId, flags: `-${anchorId}`, argument: null, description: '' })
    const rows = optionRowIds([option('x'), option('y'), option('y')], new Set(['x', 'opt-x', 'opt-x~2']))
    expect([...rows]).toEqual([
      ['x', 'opt-x~3'],
      ['y', 'opt-y'],
    ])
  })
})
