import { describe, expect, it } from 'vitest'

import type { BlockNode } from './docModel'
import { extractExamples } from './examples'

const h = (text: string, level = 2): BlockNode => ({ type: 'heading', id: text.toLowerCase(), text, level })
const p = (text: string): BlockNode => ({ type: 'paragraph', inlines: [{ type: 'text', text }] })
const code = (text: string): BlockNode => ({ type: 'code_block', id: `c-${text}`, text, languageHint: 'bash' })

describe('extractExamples', () => {
  it('reads a top-level EXAMPLES or EXAMPLE section and stops at the next section', () => {
    for (const title of ['EXAMPLES', 'EXAMPLE']) {
      const blocks = [h('DESCRIPTION'), code('not an example'), h(title), code('\n\na\n\n'), h('SEE ALSO'), code('b')]
      expect(extractExamples(blocks)).toEqual([{ label: null, text: 'a', languageHint: 'bash' }])
    }
  })

  it('ignores an EXAMPLES heading nested below a top-level section', () => {
    expect(extractExamples([h('DESCRIPTION'), h('EXAMPLES', 3), code('x'), h('EXAMPLES'), code('y')]).map((e) => e.text))
      .toEqual(['y'])
  })

  it('labels a snippet only with a short one-line paragraph or subsection heading, once', () => {
    const long = 'Extract an archive that was created with a previous command and keep the original permissions intact.'
    const blocks = [
      h('EXAMPLES'),
      p('Create an archive:'),
      code('tar -cf a.tar dir'),
      code('tar -tf a.tar'),
      p(long),
      code('tar -xf a.tar'),
      p('Stale?'),
      h('Listing', 3),
      code('tar -tvf a.tar'),
      p('two\nlines'),
      code('tar --help'),
    ]
    expect(extractExamples(blocks).map((e) => e.label)).toEqual(['Create an archive:', null, null, 'Listing', null])
  })

  it('skips long blocks without leaking their label, and keeps at most five snippets', () => {
    const program = Array.from({ length: 11 }, (_, i) => `line ${i}`).join('\n')
    const blocks = [h('EXAMPLES'), p('A program:'), code(program), code('1'), ...['2', '3', '4', '5', '6'].map(code)]
    const found = extractExamples(blocks)
    expect(found.map((e) => e.text)).toEqual(['1', '2', '3', '4', '5'])
    expect(found[0].label).toBeNull()
  })

  it('returns nothing without a section or without qualifying code blocks in it', () => {
    expect(extractExamples([])).toEqual([])
    expect(extractExamples([h('DESCRIPTION'), code('x')])).toEqual([])
    expect(extractExamples([h('EXAMPLES'), p('See the manual.'), h('SEE ALSO')])).toEqual([])
  })
})
