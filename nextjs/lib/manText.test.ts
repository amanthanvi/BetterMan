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
