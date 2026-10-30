import { describe, expect, it } from 'vitest'

import { buildOptionRegex } from '../components/man/find'
import { markSegments } from './marks'

const marked = (text: string, spec: Parameters<typeof markSegments>[1]) =>
  markSegments(text, spec).filter((s) => s.kind).map((s) => `${s.kind}:${s.text}`)

describe('markSegments', () => {
  it('marks every case-insensitive find match and keeps the text intact', () => {
    const segments = markSegments('Tar extracts tar archives.', { find: /tar/gi })
    expect(segments.map((s) => s.text).join('')).toBe('Tar extracts tar archives.')
    expect(marked('Tar extracts tar archives.', { find: /tar/gi })).toEqual(['find:Tar', 'find:tar'])
  })

  it('marks a selected flag only at token boundaries', () => {
    const text = 'Use -e here; a non-existent file, --exclude and -exec are other things.'
    expect(marked(text, { option: buildOptionRegex(['-e']) })).toEqual(['opt:-e'])
  })

  it('lets a find match win over an overlapping option mark', () => {
    expect(marked('see -c and --create', { find: /-c and/gi, option: buildOptionRegex(['-c', '--create']) })).toEqual(['find:-c and', 'opt:--create'])
  })

  it('returns the text whole when nothing matches', () => {
    expect(markSegments('nothing here', { find: /zzz/gi })).toEqual([{ text: 'nothing here' }])
  })
})
