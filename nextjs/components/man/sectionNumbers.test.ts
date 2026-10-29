import { describe, expect, it } from 'vitest'

import type { BlockNode } from '../../lib/docModel'
import { portabilityLabel } from './Portability'
import { definitionLocators, sectionNumbers } from './sectionNumbers'

const toc = [
  { id: 'synopsis', level: 2, title: 'SYNOPSIS' },
  { id: 'traditional', level: 3, title: 'Traditional usage' },
  { id: 'description', level: 2, title: 'DESCRIPTION' },
  { id: 'deep', level: 4, title: 'Deep' },
  { id: 'modes', level: 3, title: 'Operation mode' },
  { id: 'options', level: 2, title: 'OPTIONS' },
]

describe('sectionNumbers', () => {
  it('numbers sections and subsections like a book', () => {
    expect([...sectionNumbers(toc)]).toEqual([
      ['synopsis', '1'],
      ['traditional', '1.1'],
      ['description', '2'],
      ['modes', '2.1'],
      ['options', '3'],
    ])
  })

  it('leaves a subsection before any section unnumbered', () => {
    expect([...sectionNumbers([{ id: 'a', level: 3, title: 'A' }, { id: 'b', level: 2, title: 'B' }])]).toEqual([['b', '1']])
  })
})

describe('definitionLocators', () => {
  it('locates each definition in its nearest numbered section', () => {
    const term = (id: string) => ({ id, termInlines: [], definitionBlocks: [] })
    const blocks: BlockNode[] = [
      { type: 'heading', id: 'description', level: 2, text: 'DESCRIPTION' },
      { type: 'definition_list', items: [term('help')] },
      { type: 'heading', id: 'modes', level: 3, text: 'Operation mode' },
      { type: 'list', ordered: false, items: [[{ type: 'definition_list', items: [term('create')] }]] },
      { type: 'heading', id: 'deep', level: 4, text: 'Deep' },
      { type: 'definition_list', items: [term('extract')] },
    ]
    expect([...definitionLocators(blocks, sectionNumbers(toc))]).toEqual([
      ['help', '2'],
      ['create', '2.1'],
      ['extract', '2.1'],
    ])
  })
})

describe('portabilityLabel', () => {
  it('names missing and differing systems in full words', () => {
    expect(portabilityLabel({ linux: 'yes', freebsd: 'no', macos: 'no' })).toBe('Not on FreeBSD or macOS')
    expect(portabilityLabel({ linux: 'yes', freebsd: 'differs', macos: 'yes' })).toBe('Different on FreeBSD')
    expect(portabilityLabel({ linux: 'yes', freebsd: 'no', macos: 'differs' })).toBe('Not on FreeBSD; different on macOS')
  })
})
