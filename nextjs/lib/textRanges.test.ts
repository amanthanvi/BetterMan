import { describe, expect, it } from 'vitest'

import { escapeRegExp, getRanges } from './textRanges'

describe('escapeRegExp', () => {
  it('matches regular-expression metacharacters literally', () => {
    const literal = '.*+?^${}()|[]\\'
    const regex = new RegExp(`^${escapeRegExp(literal)}$`)

    expect(regex.test(literal)).toBe(true)
    expect(regex.test('unrelated')).toBe(false)
  })

  it('supports literal range discovery', () => {
    const regex = new RegExp(escapeRegExp('[a]'), 'g')

    expect(getRanges('x [a] y [a]', regex)).toEqual([
      { start: 2, end: 5 },
      { start: 8, end: 11 },
    ])
  })
})
