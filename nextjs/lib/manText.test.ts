import { expect, it } from 'vitest'

import type { ManPageResponse } from './docModel'
import { renderManText } from './manText'

const manual: ManPageResponse = {
  page: { id: 'tar', datasetReleaseId: 'test', distro: 'debian', locale: 'en', name: 'tar', section: '1', title: 'tar(1)', description: 'an archiving utility' },
  variants: [],
  content: {
    toc: [],
    synopsis: ['tar [OPTION]... [FILE]...'],
    options: [{ anchorId: 'create', flags: '-c, --create', argument: 'FILE', description: 'Create an archive.' }],
    blocks: [
      { type: 'heading', id: 'examples', level: 2, text: 'EXAMPLES' },
      { type: 'code_block', text: 'tar -cf archive.tar ./files\n\ntar -xf archive.tar' },
      { type: 'paragraph', inlines: [
        { type: 'strong', inlines: [{ type: 'text', text: 'Read ' }] },
        { type: 'emphasis', inlines: [{ type: 'link', href: '/man/gzip/1', linkType: 'internal', inlines: [{ type: 'code', text: 'gzip(1)' }] }] },
      ] },
      { type: 'definition_list', items: [{ termInlines: [{ type: 'text', text: 'Archive' }], definitionBlocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'A group of files.' }] }] }] },
      { type: 'list', ordered: true, items: [[{ type: 'paragraph', inlines: [{ type: 'text', text: 'Create' }] }], [{ type: 'list', ordered: false, items: [[{ type: 'code_block', text: 'tar -tf archive.tar' }]] }]] },
      { type: 'table', headers: ['Flag', 'Action'], rows: [['-c', 'Create']] },
      { type: 'horizontal_rule' },
    ],
  },
}

it('renders every block/inline kind as readable text, preserving code lines', () => {
  const text = renderManText(manual)
  expect(text).toContain('TAR(1)        User Commands        TAR(1)\n\nNAME\ntar - an archiving utility')
  expect(text).toContain('SYNOPSIS\ntar [OPTION]... [FILE]...')
  expect(text).toContain('OPTIONS\n-c, --create FILE\n    Create an archive.')
  expect(text).toContain('EXAMPLES\n\ntar -cf archive.tar ./files\n\ntar -xf archive.tar')
  expect(text).toContain('Read gzip(1)')
  expect(text).toContain('Archive\n    A group of files.')
  expect(text).toContain('1. Create\n2. - tar -tf archive.tar')
  expect(text).toContain('Flag  |  Action\n-c  |  Create\n\n--------\n')
})

it('keeps upstream NAME, SYNOPSIS and OPTIONS without adding extracted duplicates', () => {
  const content = { ...manual.content, blocks: ['NAME', 'SYNOPSIS', 'OPTIONS'].flatMap((text) => [
    { type: 'heading' as const, id: text, level: 2, text },
    { type: 'paragraph' as const, inlines: [{ type: 'text' as const, text: `Upstream ${text}` }] },
  ]) }
  const text = renderManText({ ...manual, content })
  expect(text).toContain('NAME\n\nUpstream NAME')
  expect(text).toContain('SYNOPSIS\n\nUpstream SYNOPSIS')
  expect(text).toContain('OPTIONS\n\nUpstream OPTIONS')
  expect(text).not.toContain('an archiving utility')
  expect(text).not.toContain('tar [OPTION]')
  expect(text).not.toContain('--create')
})

it('strips terminal controls from metadata and document text, preserving tabs and newlines', () => {
  const controls = Array.from({ length: 160 }, (_, index) => String.fromCharCode(index))
    .filter((character) => /\p{Cc}/u.test(character) && character !== '\n' && character !== '\t').join('')
  const text = renderManText({
    ...manual,
    page: { ...manual.page, description: `archive${controls}` },
    content: { ...manual.content, blocks: [{ type: 'code_block', text: `tar${controls}\t-c\nfiles` }] },
  })
  expect(text).toContain('tar - archive\n')
  expect(text).toContain('tar\t-c\nfiles')
  expect([...text].filter((character) => /\p{Cc}/u.test(character))).toEqual(expect.arrayContaining(['\n', '\t']))
  expect(text.replaceAll('\n', '').replaceAll('\t', '')).not.toMatch(/\p{Cc}/u)
})

it('does not fill OPTIONS ahead of NAME when the document already describes the options under DESCRIPTION', () => {
  const heading = (text: string) => ({ type: 'heading' as const, id: text, level: 2, text })
  const paragraph = (text: string) => ({ type: 'paragraph' as const, inlines: [{ type: 'text' as const, text }] })
  const content = {
    ...manual.content,
    options: [
      { anchorId: 'all', flags: '-a, --all', argument: null, description: 'do not ignore entries starting with .' },
      { anchorId: 'color', flags: '--color', argument: 'WHEN', description: 'colorize the output' },
    ],
    blocks: [
      heading('NAME'), paragraph('ls - list directory contents'),
      heading('SYNOPSIS'), paragraph('ls [OPTION]... [FILE]...'),
      heading('DESCRIPTION'),
      { type: 'definition_list' as const, items: [
        { termInlines: [{ type: 'text' as const, text: '-a, --all' }], definitionBlocks: [paragraph('do not ignore entries starting with .')] },
        { termInlines: [{ type: 'text' as const, text: '--color' }], definitionBlocks: [paragraph('colorize the output')] },
      ] },
    ],
  }
  const text = renderManText({ ...manual, content })
  expect(text).toContain('        TAR(1)\n\nNAME\n\nls - list directory contents')
  expect(text).not.toContain('OPTIONS')
  expect(text.split('do not ignore entries starting with .')).toHaveLength(2)
})
