import { describe, expect, it } from 'vitest'

import { metaUrl } from './previews'
import { compareKeys, sortKey } from './tables'

describe('live table sort keys', () => {
  it('reads decimal and hex numbers as numbers, the rest as text', () => {
    expect(sortKey(' 65 ')).toBe(65)
    expect(sortKey('0x41')).toBe(65)
    expect(sortKey('SPACE')).toBe('space')
    expect(['b', '10', 'A', '9'].map(sortKey).sort(compareKeys)).toEqual([9, 10, 'a', 'b'])
  })
})

describe('xref preview URLs', () => {
  it('maps a man page link to its meta endpoint, keeping an explicit distro', () => {
    expect(metaUrl('/man/bash/1')).toBe('/api/v1/man/bash/1/meta')
    expect(metaUrl('/man/foo%3A%3Abar/3pm?distro=ubuntu')).toBe('/api/v1/man/foo%3A%3Abar/3pm/meta?distro=ubuntu')
  })

  it('ignores anything that is not one page', () => {
    for (const href of ['/man/bash', '/search?q=tar', '/man/bash/1/og', 'https://example.org/']) expect(metaUrl(href)).toBeNull()
  })
})
