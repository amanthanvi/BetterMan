import { describe, expect, it } from 'vitest'

import { expandPlurals } from './expand'
import { fill, plural, source } from './lite'
import { LANGS } from './locales'
import { makeT } from './translate'
import { loadCatalog } from './server'

describe('what the browser runs', () => {
  it('fills values and drops a context', () => {
    expect(fill('{a} of {b}', { a: 1, b: 'x' })).toBe('1 of x')
    expect(fill('plain')).toBe('plain')
    expect(source('man.prefsLabel\u0004Reading preferences')).toBe('Reading preferences')
    expect(source('Reading preferences')).toBe('Reading preferences')
  })

  it('picks a plural form for the language and puts the number in', () => {
    const ru = { one: '# страница', few: '# страницы', many: '# страниц', other: '# страницы' }
    expect([1, 3, 5, 21].map((n) => plural(ru, n, 'ru'))).toEqual(['1 страница', '3 страницы', '5 страниц', '21 страница'])
    expect(plural({ other: '#ページ · {when}' }, 4, 'ja', { when: 'x' })).toBe('4ページ · x')
  })
})

describe('expandPlurals', () => {
  it('turns an ICU plural into whole-text forms and leaves other messages alone', () => {
    const expanded = expandPlurals({
      A: '{count, plural, one {# page} other {# pages}} · updated {when}',
      B: 'No plural {x}',
    })
    expect(expanded).toEqual({ A: { one: '# page · updated {when}', other: '# pages · updated {when}' }, B: 'No plural {x}' })
  })

  it('leaves no ICU in any catalog the browser reads', async () => {
    for (const lang of LANGS.filter((lang) => lang !== 'en')) {
      const catalog = await loadCatalog(lang)
      for (const group of [catalog.client, catalog.man]) {
        for (const value of Object.values(expandPlurals(group))) {
          for (const text of typeof value === 'string' ? [value] : Object.values(value)) expect(text, lang).not.toContain('plural,')
        }
      }
    }
  })
})

it.each(['ro', 'pl'] as const)('fills the footer date through the %s browser plural path', async (lang) => {
  const catalog = (await loadCatalog(lang)).client
  const key = '{count, plural, one {# page} other {# pages}} · updated {when}' as const
  const forms = expandPlurals(catalog)[key]
  expect(typeof forms).toBe('object')
  if (typeof forms === 'string') throw new Error('Expected plural forms')
  for (const count of [1, 2, 5, 12, 20, 22]) {
    const result = plural(forms, count, lang, { when: 'DATE' })
    expect(result).toBe(makeT(lang, catalog)(key, { count, when: 'DATE' }))
    expect(result).toContain('DATE')
    expect(result).not.toMatch(/[{}]/)
  }
})
