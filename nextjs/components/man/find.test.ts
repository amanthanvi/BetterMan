import { describe, expect, it } from 'vitest'

import { parseOptionTerms } from './find'

describe('parseOptionTerms', () => {
  it('splits combined short and long flags', () => {
    expect(parseOptionTerms('-c, --create')).toEqual(['-c', '--create'])
  })

  it('drops argument syntax and duplicate aliases', () => {
    expect(parseOptionTerms('--color[=WHEN], --color=WHEN, -v <path>, -v')).toEqual([
      '--color',
      '-v',
    ])
  })

  it('ignores non-flag tokens', () => {
    expect(parseOptionTerms('FILE, path, --help')).toEqual(['--help'])
  })
})
