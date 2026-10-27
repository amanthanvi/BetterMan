import { describe, expect, it } from 'vitest'

import { buildOptionRegex, parseOptionTerms } from './find'

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

describe('buildOptionRegex', () => {
  const matches = (terms: string[], text: string) => text.match(buildOptionRegex(terms)!) ?? []

  it('matches a flag only at token boundaries', () => {
    expect(matches(['-e'], 'a non-existent file, --exclude=PAT, -exec, -ef')).toEqual([])
    expect(matches(['-e'], 'Use -e, (-e) or -e.')).toEqual(['-e', '-e', '-e'])
  })

  it('matches long flags before an argument and prefers the longest term', () => {
    expect(matches(['-f', '--file'], '--file=ARCHIVE or -f ARCHIVE, not --files-from')).toEqual(['--file', '-f'])
  })

  it('escapes regex syntax and skips empty input', () => {
    expect(matches(['-?'], 'show -? help, not -x')).toEqual(['-?'])
    expect(buildOptionRegex([' ', ''])).toBeUndefined()
    expect(buildOptionRegex()).toBeUndefined()
  })
})
