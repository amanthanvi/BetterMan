import { describe, expect, it } from 'vitest'

import { isValidManImageParams, truncateOgText } from './input'

describe('Open Graph image inputs', () => {
  it('accepts bounded man page identifiers', () => {
    expect(isValidManImageParams('openssl-s_client', '1ssl')).toBe(true)
    expect(isValidManImageParams('[', '1')).toBe(true)
    expect(isValidManImageParams('_exit', '2')).toBe(true)
    expect(isValidManImageParams('__fpurge', '3')).toBe(true)
  })

  it('rejects malformed or oversized path parameters', () => {
    expect(isValidManImageParams('bad/name', '1')).toBe(false)
    expect(isValidManImageParams('a'.repeat(129), '1')).toBe(false)
    expect(isValidManImageParams('bash', '../1')).toBe(false)
    expect(isValidManImageParams('bash', `1${'a'.repeat(8)}`)).toBe(false)
  })

  it('bounds every string before image layout', () => {
    expect(truncateOgText('abcdef', 4)).toBe('abc…')
    expect(truncateOgText('abcd', 4)).toBe('abcd')
  })
})
