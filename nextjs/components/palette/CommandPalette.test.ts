import { describe, expect, it } from 'vitest'

import { parsePaletteInput, parseSearchText } from './CommandPalette'

describe('CommandPalette helpers', () => {
  it('parses action and heading prefixes while preserving escaped literals', () => {
    expect(parsePaletteInput('>theme')).toEqual({ mode: 'actions', text: 'theme' })
    expect(parsePaletteInput('#options')).toEqual({ mode: 'headings', text: 'options' })
    expect(parsePaletteInput('\\>literal')).toEqual({ mode: 'search', text: 'literal' })
    expect(parsePaletteInput('\\#literal')).toEqual({ mode: 'search', text: 'literal' })
    expect(parsePaletteInput('tar')).toEqual({ mode: 'search', text: 'tar' })
  })

  it('extracts optional distro prefixes for palette search', () => {
    expect(parseSearchText('@arch tar')).toEqual({ distro: 'arch', text: 'tar' })
    expect(parseSearchText('@macos printf')).toEqual({ distro: 'macos', text: 'printf' })
    expect(parseSearchText('@unknown tar')).toEqual({ text: '@unknown tar' })
    expect(parseSearchText('grep')).toEqual({ text: 'grep' })
  })
})
