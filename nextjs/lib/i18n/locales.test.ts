import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CATALOG_META, previewLangs, publicLangs } from './gate'
import { LANGS, LANG_NAMES, normalizeLang, resolveLang, setLang, translatedLang, withLang } from './locales'
import { holdBack, releaseHeld } from './testing'

describe('the language contract', () => {
  it('lists English first, then the six first languages', () => {
    expect(LANGS).toEqual(['en', 'de', 'fr', 'es', 'pt-BR', 'ja', 'ru'])
    for (const lang of LANGS) expect(LANG_NAMES[lang]).toBeTruthy()
  })

  it('reads a code however it is cased and rejects anything else', () => {
    expect(normalizeLang('de')).toBe('de')
    expect(normalizeLang(' PT-br ')).toBe('pt-BR')
    expect(normalizeLang('EN')).toBe('en')
    for (const bad of ['', 'pt', 'de-AT', 'deutsch', 'xx', null, undefined, 3, ['de']]) expect(normalizeLang(bad)).toBeNull()
  })
})

describe('the review gate', () => {
  it('ships every translation reviewed, with who reviewed it and when, so all six render publicly', () => {
    for (const [lang, meta] of Object.entries(CATALOG_META)) {
      expect(meta.lang).toBe(lang)
      expect(meta.status).toBe('reviewed')
      expect(meta.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(meta.reviewedBy.join('; ')).toContain('GPT-6.1 Sol')
      expect(meta.reviewedBy.join('; ')).toContain('Grok 4.7')
      expect(meta.reviewedBy.join('; ')).toContain('independent review')
    }
    expect(publicLangs('')).toEqual(['en', 'de', 'fr', 'es', 'pt-BR', 'ja', 'ru'])
    expect(publicLangs(undefined)).toEqual(publicLangs(''))
    expect(resolveLang('ru', publicLangs(''))).toBe('ru')
  })

  describe('while a language waits for review', () => {
    beforeEach(() => holdBack('de', 'fr', 'es', 'pt-BR', 'ja', 'ru'))
    afterEach(releaseHeld)

    it('renders only English', () => {
      expect(publicLangs('')).toEqual(['en'])
      expect(resolveLang('de', publicLangs(''))).toBeNull()
    })

    it('lets a deployment preview a language that is not reviewed yet, and nothing else', () => {
      expect(previewLangs('de, PT-br,xx')).toEqual(['de', 'pt-BR'])
      expect(previewLangs('all')).toEqual(['de', 'fr', 'es', 'pt-BR', 'ja', 'ru'])
      expect(previewLangs('en')).toEqual([])
      expect(publicLangs('de,ja')).toEqual(['en', 'de', 'ja'])
      expect(resolveLang('ja', publicLangs('de,ja'))).toBe('ja')
      expect(resolveLang('ru', publicLangs('de,ja'))).toBeNull()
      // English is always public and an explicit `?lang=en` is how a reader asks for it.
      expect(resolveLang('en', publicLangs(''))).toBe('en')
    })
  })
})

describe('the helper B3 reads', () => {
  it('names a translated language, and sets or clears the parameter for content URLs', () => {
    expect(translatedLang('PT-br')).toBe('pt-BR')
    expect(translatedLang('en')).toBeNull()
    expect(translatedLang('xx')).toBeNull()
    expect(setLang('/man/tar/1?lang=de#o', 'fr')).toBe('/man/tar/1?lang=fr#o')
    expect(setLang('/man/tar/1?lang=de', 'en')).toBe('/man/tar/1')
    expect(setLang('https://betterman.sh/man/tar/1?distro=fedora&lang=de', null)).toBe('https://betterman.sh/man/tar/1?distro=fedora')
  })
})

describe('links', () => {
  it('adds the language to an in-app or absolute URL, and nothing for none', () => {
    expect(withLang('/search?q=tar', 'de')).toBe('/search?q=tar&lang=de')
    expect(withLang('/man/tar/1?distro=fedora#opt', 'pt-BR')).toBe('/man/tar/1?distro=fedora&lang=pt-BR#opt')
    expect(withLang('https://betterman.sh/licenses', 'ja')).toBe('https://betterman.sh/licenses?lang=ja')
    expect(withLang('/search?q=c%2B%2B', null)).toBe('/search?q=c%2B%2B')
    expect(withLang('/', undefined)).toBe('/')
  })
})
