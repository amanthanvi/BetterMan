import { describe, expect, it } from 'vitest'

import { format, formatList, makeT, source } from './translate'

describe('format', () => {
  it('inserts values and leaves a message without braces alone', () => {
    expect(format('Bookmark {citation}', { citation: 'tar(1)' }, 'en')).toBe('Bookmark tar(1)')
    expect(format('No braces here', undefined, 'en')).toBe('No braces here')
    expect(format('{a} and {b}', { a: 1, b: 'two' }, 'en')).toBe('1 and two')
    expect(format('Hello {missing}!', {}, 'en')).toBe('Hello !')
  })

  it('picks a plural form by the language’s own rules', () => {
    const en = '{count, plural, one {# page} other {# pages}}'
    expect(format(en, { count: 1 }, 'en')).toBe('1 page')
    expect(format(en, { count: 2 }, 'en')).toBe('2 pages')
    expect(format(en, { count: 4712 }, 'en')).toBe('4,712 pages')

    const ru = '{count, plural, one {# страница} few {# страницы} many {# страниц} other {# страницы}}'
    expect([1, 2, 5, 11, 21, 22, 25].map((count) => format(ru, { count }, 'ru'))).toEqual([
      '1 страница', '2 страницы', '5 страниц', '11 страниц', '21 страница', '22 страницы', '25 страниц',
    ])
    expect(format('{count, plural, other {#ページ}}', { count: 1 }, 'ja')).toBe('1ページ')
    expect(format('{count, plural, one {# page} other {# pages}}', { count: 0 }, 'fr')).toBe('0 page')
  })

  it('formats plurals inside a longer message, with other values around them', () => {
    expect(format('{count, plural, one {# page} other {# pages}} · updated {when}', { count: 2, when: 'today' }, 'en')).toBe('2 pages · updated today')
    expect(format('{distro} に{count, plural, other {#ページ}}あります。', { distro: 'Debian', count: 3 }, 'ja')).toBe('Debian に3ページあります。')
  })
})

describe('makeT', () => {
  it('translates with the catalog and carries its language', () => {
    const t = makeT('de', { 'One {x}': 'Eins {x}', Two: 'Zwei' })
    expect(t('One {x}', { x: 'y' })).toBe('Eins y')
    expect(t('Two')).toBe('Zwei')
    expect(t.lang).toBe('de')
  })

  it('is English without a catalog: the message is the text', () => {
    const t = makeT('en', null)
    expect(t('Bookmark {citation}', { citation: 'tar(1)' })).toBe('Bookmark tar(1)')
    expect(t('{count, plural, one {# page} other {# pages}}', { count: 3 })).toBe('3 pages')
  })

  it('shows a message with no translation in English, and drops its context', () => {
    const t = makeT<string>('de', { Known: 'Bekannt' })
    expect(t('Unknown')).toBe('Unknown')
    expect(t('title\u0004Search')).toBe('Search')
    expect(source('title\u0004Search')).toBe('Search')
    expect(source('Search')).toBe('Search')
  })
})

it('writes a list the way the language does', () => {
  expect(formatList(['FreeBSD', 'macOS'], 'en', 'disjunction')).toBe('FreeBSD or macOS')
  expect(formatList(['FreeBSD', 'macOS'], 'de', 'conjunction')).toBe('FreeBSD und macOS')
})
