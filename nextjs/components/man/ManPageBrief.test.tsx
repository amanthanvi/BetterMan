import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BlockNode, ManPageBrief, OptionItem } from '../../lib/docModel'
import { briefFlagGroups, briefView, commandSegments, gloss, portabilityWords } from '../../lib/manBrief'
import { ManPageBriefSection } from './ManPageBrief'
import { OptionsTable } from './OptionsTable'
import { tServer } from '../../lib/i18n/testing'

const options: OptionItem[] = [
  { flags: '-c, --create', anchorId: 'opt-create', description: 'Create a new archive. Arguments name the files.' },
  { flags: '-x, --extract', anchorId: 'opt-extract', description: 'Extract files from an archive.' },
  { flags: '-f, --file', anchorId: 'opt-file', argument: 'ARCHIVE', description: 'Use archive file ARCHIVE.' },
]
const blocks: BlockNode[] = [
  { type: 'heading', id: 'operation-mode', level: 3, text: 'Operation mode' },
  { type: 'definition_list', items: [
    { id: 'opt-create', termInlines: [{ type: 'text', text: '-c' }], definitionBlocks: [] },
    { id: 'opt-extract', termInlines: [{ type: 'text', text: '-x' }], definitionBlocks: [] },
  ] },
  { type: 'heading', id: 'device-selection', level: 3, text: 'Device selection' },
  { type: 'definition_list', items: [{ id: 'opt-file', termInlines: [{ type: 'text', text: '-f' }], definitionBlocks: [] }] },
]
const verified = { source: 'verified-frequency' as const, flags: [
  { flag: '-c', anchorId: 'opt-create', count: 4, sources: ['tldr' as const] },
  { flag: '-f', anchorId: 'opt-file', count: 3, sources: ['tldr' as const] },
  { flag: '-x', anchorId: 'opt-extract', count: 2, sources: ['examples' as const] },
] }
const generated = { provider: 'opencode-go', model: 'deepseek-v4.1-flash', promptVersion: 'b6-v1', generatedAt: '2026-10-28' }

describe('In brief data', () => {
  it('groups most-used flags as one mode, then add, when the page defines modes', () => {
    expect(briefFlagGroups(verified, options, blocks)).toEqual([
      { label: 'One mode', flags: [
        { flag: '-c', anchorId: 'opt-create', argument: null, gloss: 'Create a new archive' },
        { flag: '-x', anchorId: 'opt-extract', argument: null, gloss: 'Extract files from an archive' },
      ] },
      { label: 'Then add', flags: [{ flag: '-f', anchorId: 'opt-file', argument: 'ARCHIVE', gloss: 'Use archive file ARCHIVE' }] },
    ])
  })

  it('shows flags only when they were counted, and ungrouped without modes', () => {
    expect(briefFlagGroups({ ...verified, source: 'manual-order' }, options, blocks)).toEqual([])
    expect(briefFlagGroups(verified, options, [])).toEqual([{ label: null, flags: expect.any(Array) }])
  })

  it('omits the whole section when nothing is there, and falls back to the page EXAMPLES', () => {
    expect(briefView({ brief: null, fallbackExamples: [], mostUsed: undefined, options: [], blocks: [] })).toBeNull()
    expect(briefView({ brief: null, fallbackExamples: [{ text: 'tar -cf a.tar dir', languageHint: null, label: 'Make one' }], mostUsed: undefined, options, blocks })).toEqual({
      summary: null, generated: null, flagGroups: [],
      examples: [{ source: 'page', description: 'Make one', command: 'tar -cf a.tar dir' }],
    })
  })

  it('splits placeholders as ranges and ignores bad ones', () => {
    expect(commandSegments('tar -cf path/to/a.tar dir', [[8, 21], [3, 50], [9, 10]])).toEqual([
      { text: 'tar -cf ', placeholder: false }, { text: 'path/to/a.tar', placeholder: true }, { text: ' dir', placeholder: false },
    ])
  })

  it('cuts a gloss to its first sentence and one line', () => {
    expect(gloss('Use FILE. More text.')).toBe('Use FILE')
    expect(gloss('x'.repeat(100))).toHaveLength(80)
  })

  it('writes the cells as words', () => {
    expect(portabilityWords('aaa', tServer)).toBe('on all three')
    expect(portabilityWords('axd', tServer)).toBe('not on FreeBSD; differs on macOS')
    expect(portabilityWords('apl', tServer)).toBe('unknown on FreeBSD and macOS')
  })
})

describe('In brief', () => {
  const brief: ManPageBrief = {
    summary: 'Creates archives <img src=x onerror=alert(1)>.',
    examples: [
      { source: 'page', description: 'From the manual', command: 'tar -cf a.tar dir' },
      { source: 'tldr', description: 'Create an archive', command: 'tar -cf path/to/a.tar dir', placeholders: [[8, 21]],
        attribution: { name: 'tldr-pages', url: 'https://github.com/tldr-pages/tldr/blob/abc/pages/common/tar.md', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', modified: 'Placeholders converted.' } },
      { source: 'generated', description: 'Archive the folder', command: 'tar -c <dir>' },
    ],
    taskPhrases: [], tldr: null, generated,
  }
  const html = renderToStaticMarkup(<ManPageBriefSection view={briefView({ brief, fallbackExamples: [], mostUsed: verified, options, blocks })!} t={tServer} />)

  it('renders generated and tldr text as text, never markup', () => {
    expect(html).toContain('Creates archives &lt;img src=x onerror=alert(1)&gt;.')
    expect(html).not.toContain('<img')
    expect(html).toContain('tar -c &lt;dir&gt;')
  })

  it('labels every example with its source and credits tldr-pages', () => {
    expect(html).toContain('from EXAMPLES')
    expect(html).toContain('href="https://github.com/tldr-pages/tldr/blob/abc/pages/common/tar.md"')
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"')
    expect(html).toContain('tldr-pages examples, modified: Placeholders converted.')
    expect(html.match(/generated · deepseek-v4\.1-flash, 2026-10-28/g)).toHaveLength(2)
    expect(html).toContain('<i>path/to/a.tar</i>')
  })

  it('links most-used flags to their definitions under their mode headings', () => {
    expect(html).toContain('One mode')
    expect(html).toContain('Then add')
    expect(html).toContain('href="#opt-create"')
  })
})

describe('Options index portability', () => {
  const portability = { systems: [], rows: [['opt-create', 'aaa'], ['opt-extract', 'axa']] as [string, string][], total: 3, available: 3, nextOffset: null }
  const render = (mode: 'glyph' | 'text') =>
    renderToStaticMarkup(<OptionsTable t={tServer} options={options} rowIds={new Map()} portability={portability} portabilityMode={mode}
      newIn={[{ anchorId: 'opt-file', flags: ['-f'], datasetReleaseId: 'r2', packageVersion: '1.35' }]} />)

  it('marks portable rows for the Portable only filter and new options with their version', () => {
    const html = render('glyph')
    expect(html.match(/data-bm-portable=""/g)).toHaveLength(1)
    expect(html).toContain('new in 1.35')
    expect(html).toContain('role="img"')
  })

  it('writes the cells as words in text mode', () => {
    const html = render('text')
    expect(html).toContain('not on FreeBSD')
    expect(html).not.toContain('role="img"')
  })
})
