import { describe, expect, it } from 'vitest'

import { hasBareRsc, manQueryParams, normalizeManQuery } from './manQuery'

const PAGE = '/man/tar/1'

describe('man page query allowlist', () => {
  it('passes a canonical query, or none', () => {
    for (const search of ['', '?distro=ubuntu', '?distro=debian', '?pkg=tar', '?portability=text', '?flag=-x', '?flag=--extract', '?lang=de',
      '?distro=ubuntu&pkg=tar&portability=text&flag=-x&lang=pt-BR', '?flag=-x&distro=ubuntu', '?pkg=g%2B%2B', '?flag=-%23']) {
      expect(normalizeManQuery(PAGE, search), search).toBeNull()
    }
  })

  it.each([
    ['?zz=1', ''],
    ['?zz=a&zz=b&utm_source=hn&utm_medium=x', ''],
    ['?utm_source=x&distro=ubuntu', '?distro=ubuntu'],
    ['?__bm_release=2026-10-28&flag=-x', '?flag=-x'],
    ['?_rsc=abc', ''],
    ['?&&distro=ubuntu&', '?distro=ubuntu'],
    ['?distro', ''],
    ['?distro=', ''],
  ])('drops parameters outside the allowlist: %s → %j', (search, canonical) => {
    expect(normalizeManQuery(PAGE, search)).toBe(canonical)
  })

  it.each([
    ['?flag=-c&flag=-x', '?flag=-c'],
    ['?distro=ubuntu&distro=fedora', '?distro=ubuntu'],
    ['?flag=nope&flag=-x', '?flag=-x'],
  ])('keeps the first valid value of a repeated parameter: %s → %j', (search, canonical) => {
    expect(normalizeManQuery(PAGE, search)).toBe(canonical)
  })

  it.each([
    ['?distro=Ubuntu', ''],
    ['?distro=gentoo', ''],
    ['?portability=glyph', ''],
    ['?portability=words', ''],
    ['?flag=x', ''],
    ['?flag=--sort=WORD', ''],
    ['?flag=-x%20-y', ''],
    ['?pkg=Not/A/Package', ''],
    ['?pkg=' + 'a'.repeat(201), ''],
    ['?lang=en', ''],
    ['?lang=xx', ''],
    ['?flag=%E0%A4', ''],
  ])('drops invalid values: %s → %j', (search, canonical) => {
    expect(normalizeManQuery(PAGE, search)).toBe(canonical)
  })

  it.each([
    ['?pkg=g++', '?pkg=g%2B%2B'],
    ['?flag=-%63', '?flag=-c'],
    ['?fl%61g=-x', '?flag=-x'],
    ['?flag=-#', '?flag=-%23'],
  ])('spells a valid value one way: %s → %j', (search, canonical) => {
    expect(normalizeManQuery(PAGE, search)).toBe(canonical)
  })

  it('keeps valid parameters beside extra ones', () => {
    expect(normalizeManQuery(PAGE, '?flag=-x&distro=ubuntu&zz=1&pkg=tar&utm_campaign=c')).toBe('?flag=-x&distro=ubuntu&pkg=tar')
  })

  it('reads only what each kind of man URL uses', () => {
    expect(manQueryParams('/man/tar/1')).toEqual(['distro', 'pkg', 'portability', 'flag', 'lang'])
    expect(manQueryParams('/man/tar')).toEqual(['distro', 'pkg', 'lang'])
    expect(manQueryParams('/man/tar/1.txt')).toEqual(['distro', 'pkg', 'lang'])
    expect(manQueryParams('/tar.1.txt')).toEqual(['distro', 'pkg', 'lang'])
    expect(manQueryParams('/man/tar/1/og')).toEqual(['distro', 'pkg', 'flag'])
    expect(normalizeManQuery('/man/tar/1/og', '?flag=-x&portability=text&zz=1')).toBe('?flag=-x')
    expect(manQueryParams('/search')).toBeNull()
    expect(normalizeManQuery('/man/tar', '?flag=-x&portability=text&distro=ubuntu')).toBe('?distro=ubuntu')
    expect(normalizeManQuery('/tar.txt', '?distro=ubuntu&x=1')).toBe('?distro=ubuntu')
    expect(normalizeManQuery('/search', '?q=tar&zz=1')).toBeNull()
  })
})

describe('a bare _rsc', () => {
  it('is one without the rsc header', () => {
    expect(hasBareRsc('/man/tar/1?_rsc=abc', {})).toBe(true)
    expect(hasBareRsc('/man/tar/1?_rsc=abc', { rsc: '1' })).toBe(false)
    expect(hasBareRsc('/man/tar/1?distro=ubuntu', {})).toBe(false)
    expect(hasBareRsc(undefined, {})).toBe(false)
  })
})
