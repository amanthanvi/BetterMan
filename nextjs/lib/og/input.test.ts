import { describe, expect, it } from 'vitest'

import { isValidManImageParams, plainOgText, truncateOgText } from './input'

describe('Open Graph image inputs', () => {
  it('accepts bounded man page identifiers', () => {
    expect(isValidManImageParams('openssl-s_client', '1ssl')).toBe(true)
    expect(isValidManImageParams('[', '1')).toBe(true)
    expect(isValidManImageParams('_exit', '2')).toBe(true)
    expect(isValidManImageParams('__fpurge', '3')).toBe(true)
    expect(isValidManImageParams('systemd-backlight@.service', '8')).toBe(true)
    expect(isValidManImageParams('a'.repeat(200), '1')).toBe(true)
  })

  it('rejects malformed or oversized path parameters', () => {
    expect(isValidManImageParams('bad/name', '1')).toBe(false)
    expect(isValidManImageParams('bash\n', '1')).toBe(false)
    expect(isValidManImageParams('a'.repeat(201), '1')).toBe(false)
    expect(isValidManImageParams('bash', '../1')).toBe(false)
    expect(isValidManImageParams('bash', `1${'a'.repeat(8)}`)).toBe(false)
  })

  it('bounds every string before image layout', () => {
    expect(truncateOgText('abcdef', 4)).toBe('abc…')
    expect(truncateOgText('abcd', 4)).toBe('abcd')
    expect(truncateOgText('ab cdef', 4)).toBe('ab…')
  })

  it('cuts at a code point, never inside a surrogate pair', () => {
    expect(truncateOgText('𝔞𝔟𝔠𝔡', 3)).toBe('𝔞𝔟…')
  })

  it('keeps card text plain: no controls or direction overrides', () => {
    expect(plainOgText('a\u0000b\n\tc  d')).toBe('a b c d')
    expect(plainOgText('safe\u202egnp.exe')).toBe('safe gnp.exe')
    expect(plainOgText('\u2066x\u2069 <b>y</b>')).toBe('x <b>y</b>')
  })
})
