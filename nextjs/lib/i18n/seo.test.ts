import { describe, expect, it } from 'vitest'

import { translationFixHref } from './fix'
import { hreflangAlternates, isLocalizedUi, localizedSeo } from './seo'
import { requestLangFromHeaders } from './request'

describe('localized UI pages', () => {
  it('leave English alone and send every other language to noindex with the English canonical', () => {
    expect(localizedSeo('en', '/section/1')).toEqual({})
    expect(localizedSeo('de', '/section/1')).toEqual({ robots: { index: false, follow: true }, alternates: { canonical: '/section/1' } })
    expect(isLocalizedUi('en')).toBe(false)
    expect(isLocalizedUi('ja')).toBe(true)
  })

  it('offers hreflang groundwork for B3: English is the bare URL and x-default, the rest carry ?lang=', () => {
    expect(hreflangAlternates('https://betterman.sh/man/tar/1', ['en', 'de', 'pt-BR'])).toEqual({
      'x-default': 'https://betterman.sh/man/tar/1',
      en: 'https://betterman.sh/man/tar/1',
      de: 'https://betterman.sh/man/tar/1?lang=de',
      'pt-BR': 'https://betterman.sh/man/tar/1?lang=pt-BR',
    })
  })
})

describe('translationFixHref', () => {
  it('opens the translation form with the language, the page and, when it is for one string, its key', () => {
    const page = new URL(translationFixHref({ lang: 'ja', page: '/man/tar/1?lang=ja' }))
    expect(`${page.origin}${page.pathname}`).toBe('https://github.com/amanthanvi/BetterMan/issues/new')
    expect(page.searchParams.get('template')).toBe('translation_fix.yml')
    expect(page.searchParams.get('locale')).toBe('ja')
    expect(page.searchParams.get('page')).toBe('/man/tar/1?lang=ja')
    expect(page.searchParams.has('key')).toBe(false)

    const one = new URL(translationFixHref({ lang: 'pt-BR', page: '/', key: 'shell.skip' }))
    expect(one.searchParams.get('key')).toBe('shell.skip')
    expect(one.searchParams.get('title')).toBe('[Translation]: pt-BR shell.skip')
  })

  it('clips what it prefills, so the URL stays short enough for GitHub', () => {
    const href = translationFixHref({ lang: 'de', page: `/search?q=${'x'.repeat(2000)}` })
    expect(href.length).toBeLessThan(1000)
  })
})

describe('requestLangFromHeaders', () => {
  const headers = (value: string | null) => ({ get: (name: string) => (name === 'x-bm-lang' ? value : null) })
  it('reads only a public language from the proxy’s header', () => {
    expect(requestLangFromHeaders(headers('de'), ['en', 'de'])).toBe('de')
    expect(requestLangFromHeaders(headers('ru'), ['en', 'de'])).toBe('en')
    expect(requestLangFromHeaders(headers('nonsense'), ['en', 'de'])).toBe('en')
    expect(requestLangFromHeaders(headers(null), ['en', 'de'])).toBe('en')
  })
})
