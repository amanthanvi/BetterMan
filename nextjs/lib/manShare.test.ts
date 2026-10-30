import { describe, expect, it } from 'vitest'

import type { OptionItem } from './docModel'
import { manOption, shareFlag, withShareFlag } from './manShare'

const options: OptionItem[] = [
  { anchorId: 'opt-x', flags: '-x, --extract, --get', description: 'Extract files from an archive.' },
  { anchorId: 'opt-sort', flags: '--sort=ORDER', description: 'Sort names.' },
  { anchorId: 'opt-x2', flags: '-x', description: 'A later definition of -x.' },
]

describe('per-flag share cards', () => {
  it('accepts one flag key and nothing else', () => {
    expect(shareFlag('-x')).toBe('-x')
    expect(shareFlag('--sort')).toBe('--sort')
    expect(shareFlag('--sort=ORDER')).toBeNull()
    expect(shareFlag('x')).toBeNull()
    expect(shareFlag('-x y')).toBeNull()
    expect(shareFlag('')).toBeNull()
    expect(shareFlag(null)).toBeNull()
  })

  it('finds the first option that defines a flag, as the options index does', () => {
    expect(manOption(options, '--get')?.anchorId).toBe('opt-x')
    expect(manOption(options, '-x')?.anchorId).toBe('opt-x')
    expect(manOption(options, '--sort')?.anchorId).toBe('opt-sort')
    expect(manOption(options, '-X')).toBeNull()
    expect(manOption(options, '--sort=ORDER')).toBeNull()
    expect(manOption(null, '-x')).toBeNull()
  })

  it('appends the flag to page and image URLs', () => {
    expect(withShareFlag('/man/tar/1', '-x')).toBe('/man/tar/1?flag=-x')
    expect(withShareFlag('/man/tar/1/og?distro=ubuntu', '--extract')).toBe('/man/tar/1/og?distro=ubuntu&flag=--extract')
    expect(withShareFlag('/man/tar/1', '-#')).toBe('/man/tar/1?flag=-%23')
  })
})
