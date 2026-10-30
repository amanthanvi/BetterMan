import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlockNode, OptionItem } from '../lib/docModel'
import { modeAnchors } from '../lib/manBrief'
import { argumentSpec, commandText, composerWarnings, shellWord, type ComposePick } from './composeModel'
import { loadMeta, resetPreviews } from './previews'

function fixture(name: string): { blocks: BlockNode[]; options: OptionItem[] } {
  const raw = JSON.parse(readFileSync(join(__dirname, '../components/doc/__fixtures__', name), 'utf8')) as { doc: { blocks: BlockNode[] }; options?: OptionItem[] }
  return { blocks: raw.doc.blocks, options: raw.options ?? [] }
}

/** A pick as the composer makes it from a page's options index row. */
function picker(page: { blocks: BlockNode[]; options: OptionItem[] }) {
  const modes = modeAnchors(page.blocks)
  return (anchorId: string, flag: string, value = '', portability: string | null = null): ComposePick => {
    const option = page.options.find((o) => o.anchorId === anchorId)
    if (!option) throw new Error(`no option ${anchorId}`)
    return { flag, argument: option.argument ?? '', portability, mode: modes.has(anchorId), value }
  }
}

describe('composer on real pages', () => {
  const tar = picker(fixture('tar.1.json'))

  it('warns when two of tar\'s operation modes are picked, and not for a mode with its modifiers', () => {
    expect(composerWarnings([tar('c', '-c'), tar('x', '-x')])).toBe('Choose one mode: -c and -x conflict.')
    expect(composerWarnings([tar('c', '-c'), tar('g', '-g', 'snapshot.snar'), tar('f', '-f', 'a.tar')])).toBe('')
  })

  it('builds tar -c -g FILE -f ARCHIVE only from typed values', () => {
    const picks = [tar('g', '-g'), tar('c', '-c'), tar('f', '-f')]
    expect(commandText('tar', picks)).toEqual({ text: 'tar -c -g -f', missing: ['FILE for -g', 'ARCHIVE for -f'] })
    const typed = [tar('g', '-g', 'snap.snar'), tar('c', '-c'), tar('f', '-f', 'my backup.tar')]
    expect(commandText('tar', typed)).toEqual({ text: "tar -c -g snap.snar -f 'my backup.tar'", missing: [] })
  })

  it('drops ls --color\'s optional WHEN when empty, and attaches it when typed', () => {
    const ls = picker(fixture('ls.1.json'))
    const colorAnchor = fixture('ls.1.json').options.find((o) => o.flags.includes('--color'))!.anchorId
    expect(argumentSpec(fixture('ls.1.json').options.find((o) => o.anchorId === colorAnchor)!.argument ?? '')).toEqual({ name: 'WHEN', optional: true })
    expect(commandText('ls', [ls(colorAnchor, '--color')])).toEqual({ text: 'ls --color', missing: [] })
    expect(commandText('ls', [ls(colorAnchor, '--color', 'always')])).toEqual({ text: 'ls --color=always', missing: [] })
    expect(composerWarnings([ls(colorAnchor, '--color', '', 'att')])).toBe('--color: unknown on FreeBSD and macOS.')
  })

  it('never warns for grep\'s matcher options, whose heading is not an exclusive-modes heading', () => {
    const blocks: BlockNode[] = [
      { type: 'heading', id: 'matcher', level: 3, text: 'Matcher Selection' },
      { type: 'definition_list', items: ['E', 'F'].map((id) => ({ id, termInlines: [{ type: 'text', text: `-${id}` }], definitionBlocks: [] })) },
      { type: 'heading', id: 'control', level: 3, text: 'Matching Control' },
      { type: 'definition_list', items: [{ id: 'i', termInlines: [{ type: 'text', text: '-i' }], definitionBlocks: [] }, { id: 'e', termInlines: [{ type: 'text', text: '-e' }], definitionBlocks: [] }] },
    ]
    const grep = picker({ blocks, options: [
      { flags: '-E, --extended-regexp', anchorId: 'E', description: '' },
      { flags: '-F, --fixed-strings', anchorId: 'F', description: '' },
      { flags: '-i, --ignore-case', anchorId: 'i', description: '' },
      { flags: '-e, --regexp', anchorId: 'e', argument: 'PATTERNS', description: '' },
    ] })
    expect(composerWarnings([grep('E', '-E'), grep('i', '-i'), grep('e', '-e', 'foo|bar')])).toBe('')
    expect(commandText('grep', [grep('E', '-E'), grep('e', '-e', 'foo|bar')]).text).toBe("grep -E -e 'foo|bar'")
  })
})

describe('arguments', () => {
  it('reads the manual\'s notation as required or optional', () => {
    expect(argumentSpec('ARCHIVE')).toEqual({ name: 'ARCHIVE', optional: false })
    expect(argumentSpec('=FILE')).toEqual({ name: 'FILE', optional: false })
    expect(argumentSpec('[N]')).toEqual({ name: 'N', optional: true })
    expect(argumentSpec('<file>')).toEqual({ name: 'file', optional: false })
    expect(argumentSpec('')).toBeNull()
  })

  it('attaches a short option\'s optional value and quotes what the shell would split or expand', () => {
    expect(commandText('x', [{ flag: '-c', argument: '[N]', portability: null, mode: false, value: '5' }]).text).toBe('x -c5')
    expect(shellWord("it's *")).toBe(`'it'\\''s *'`)
    expect(shellWord('a/b.tar')).toBe('a/b.tar')
  })
})

describe('xref preview cache', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetPreviews()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const ok = () => new Response(JSON.stringify({ page: { name: 'bash', section: '1', description: 'shell' } }), { status: 200 })

  it('caches a page and a 404 for the page view', async () => {
    fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(new Response('{}', { status: 404 }))
    expect(await loadMeta('/a')).toEqual({ name: 'bash', section: '1', description: 'shell' })
    expect(await loadMeta('/a')).toMatchObject({ name: 'bash' })
    expect(await loadMeta('/b')).toBeNull()
    expect(await loadMeta('/b')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not remember a 429 or 5xx as "no page", and backs off before retrying', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(ok())
    expect(await loadMeta('/c')).toBeUndefined()
    // Hovering again at once does not refetch.
    expect(await loadMeta('/c')).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_001)
    expect(await loadMeta('/c')).toMatchObject({ name: 'bash' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
