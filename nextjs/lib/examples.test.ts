import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { BlockNode, DocumentModel } from './docModel'
import { extractExamples } from './examples'

const heading = (text = 'EXAMPLES', level = 2): BlockNode => ({ type: 'heading', id: text.toLowerCase(), text, level })
const paragraph = (text: string): BlockNode => ({ type: 'paragraph', inlines: [{ type: 'text', text }] })
const code = (text: string): BlockNode => ({ type: 'code_block', text })

function golden(name: string): DocumentModel {
  return (JSON.parse(readFileSync(join(__dirname, '../components/doc/__fixtures__', name), 'utf8')) as { doc: DocumentModel }).doc
}

describe('extractExamples', () => {
  it('returns nothing without an EXAMPLES heading, including isolated code', () => {
    expect(extractExamples([])).toEqual([])
    expect(extractExamples([paragraph('Example'), code('echo hello'), heading('DESCRIPTION')])).toEqual([])
  })

  it('matches the heading case-insensitively and uses the closest preceding paragraph', () => {
    expect(extractExamples([
      paragraph('Outside the section'), heading('  Examples  '), code('first'),
      paragraph('Earlier label'), paragraph('Closest label'), code('second'), code('third'),
    ])).toEqual([
      { label: null, text: 'first' },
      { label: 'Closest label', text: 'second' },
      { label: 'Closest label', text: 'third' },
    ])
  })

  it.each([1, 2])('stops at the next heading at level %i', (level) => {
    expect(extractExamples([heading(), code('inside'), heading('NEXT', level), code('outside')]))
      .toEqual([{ label: null, text: 'inside' }])
  })

  it('only considers the first EXAMPLES section, even if empty', () => {
    expect(extractExamples([heading(), paragraph('No commands'), heading('NEXT'), heading(), code('later')])).toEqual([])
  })

  it('walks list and definition descendants in document order and includes subsections', () => {
    const blocks: BlockNode[] = [
      heading(), paragraph('Outer label'), heading('Subsection', 3),
      { type: 'list', ordered: true, items: [[code('first')], [
        { type: 'definition_list', items: [{ termInlines: [], definitionBlocks: [paragraph('Nested label'), code('second')] }] },
      ]] },
      code('third'), heading('NEXT'), code('outside'),
    ]
    expect(extractExamples(blocks)).toEqual([
      { label: 'Outer label', text: 'first' },
      { label: 'Nested label', text: 'second' },
      { label: 'Nested label', text: 'third' },
    ])
  })

  it('stops at a section boundary nested inside a container', () => {
    expect(extractExamples([heading(), {
      type: 'list', ordered: false, items: [[code('inside'), heading('NEXT'), code('outside')]],
    }, code('also outside')])).toEqual([{ label: null, text: 'inside' }])
  })

  it('limits previews to five code blocks', () => {
    expect(extractExamples([heading(), ...Array.from({ length: 8 }, (_, index) => code(String(index)))])
      .map((example) => example.text)).toEqual(['0', '1', '2', '3', '4'])
  })

  it('flattens formatted labels, preserves text/language, and omits IDs without mutating input', () => {
    const blocks: BlockNode[] = [heading(), {
      type: 'paragraph', inlines: [
        { type: 'text', text: 'Run ' },
        { type: 'strong', inlines: [{ type: 'code', text: 'make' }] },
        { type: 'link', href: '/man/make/1', linkType: 'internal', inlines: [{ type: 'emphasis', inlines: [{ type: 'text', text: ' safely' }] }] },
      ],
    }, { type: 'code_block', id: 'source-example', text: '\nmake all\n', languageHint: 'makefile' }]
    const before = JSON.stringify(blocks)
    const [example] = extractExamples(blocks)
    expect(example).toEqual({ label: 'Run make safely', text: '\nmake all\n', languageHint: 'makefile' })
    expect(example).not.toHaveProperty('id')
    expect(JSON.stringify(blocks)).toBe(before)
  })

  it.each(['tar.1.json', 'ssh_config.5.json'])('does not infer an EXAMPLES section in the actual %s golden', (name) => {
    expect(extractExamples(golden(name).blocks)).toEqual([])
  })

  it('extracts the actual tar command payloads when placed in an EXAMPLES section', () => {
    const blocks = golden('tar.1.json').blocks
    const examples = extractExamples([heading(), ...blocks.slice(33, 45), heading('NEXT'), code('outside')])
    expect(examples.map((example) => example.text)).toEqual([
      'tar cfv etc.tar /etc', 'tar -cvf etc.tar /etc', 'tar -c -v -f etc.tar /etc',
      'tar --create --file etc.tar --verbose /etc', 'tar --cre --file=etc.tar --verb /etc',
    ])
    expect(examples[0].label).toContain('instructs tar to store all files from the directory /etc')
    expect(examples[1].label).toBe('The example command above written in the short-option style could look like:')
    expect(examples[2].label).toBe(examples[1].label)
  })

  it('extracts an actual ssh_config nested command and its preceding linked paragraph', () => {
    const definitions = golden('ssh_config.5.json').blocks[12]
    if (definitions.type !== 'definition_list') throw new Error('ssh_config golden no longer contains its option list')
    const proxy = definitions.items.find((item) => item.id === 'ProxyCommand')
    if (!proxy) throw new Error('ssh_config golden no longer contains ProxyCommand')
    expect(extractExamples([heading(), { type: 'definition_list', items: [proxy] }])).toEqual([{
      label: 'This directive is useful in conjunction with nc(1) and its proxy support. For example, the following directive would connect via an HTTP proxy at 192.0.2.0:',
      text: 'ProxyCommand /usr/bin/nc -X connect -x 192.0.2.0:8080 %h %p',
      languageHint: null,
    }])
  })
})
