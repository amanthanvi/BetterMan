import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetchManByNameAndSectionOrAlias: vi.fn(), fetchRelated: vi.fn(), fetchTranslatedMan: vi.fn() }))
vi.mock('./rateLimit', () => ({ isRateLimited: async () => false }))
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    FastApiError: actual.FastApiError,
    withDistroFallback: actual.withDistroFallback,
    servedRelease: actual.servedRelease,
    answeredBy: actual.answeredBy,
    translationAnsweredBy: actual.translationAnsweredBy,
    fetchTranslatedMan: mocks.fetchTranslatedMan,
    fetchManByNameAndSectionOrAlias: mocks.fetchManByNameAndSectionOrAlias,
    fetchRelated: mocks.fetchRelated,
    fetchManResolve: vi.fn(),
    fetchManDistros: vi.fn(),
    suggest: vi.fn(),
  }
})

import { setLang, translatedLang } from './i18n/locales'
import { MAN_LANGUAGES } from './manQuery'
import { lookupManPage } from './manLookup'
import { translationUrlset } from './translationSitemap'

const page = (release: string, locale = 'en') => ({ kind: 'page', data: { page: { name: 'tar', section: '1', locale, datasetReleaseId: release } } })

describe('lang (#395)', () => {
  it('takes its languages from B9\'s one list, English as no translation, English bare', () => {
    expect(translatedLang('pt-BR')).toBe('pt-BR')
    expect(translatedLang('en')).toBeNull()
    expect(translatedLang('pt_BR')).toBeNull()
    expect(MAN_LANGUAGES).toEqual(['de', 'fr', 'es', 'pt-BR', 'ja', 'ru'])
    expect(setLang('/man/tar/1?distro=ubuntu', 'de')).toBe('/man/tar/1?distro=ubuntu&lang=de')
    expect(setLang('https://betterman.sh/man/tar/1?lang=de', 'en')).toBe('https://betterman.sh/man/tar/1')
  })
})

describe('translated lookups', () => {
  const translation = { lang: 'de' as const, datasetReleaseId: 'de1', known: true }
  const translated = { state: 'translated', locale: 'de', englishReleaseId: 'en1', englishHasRoute: true, englishIndexable: true, languages: ['en', 'de'] }
  const lookup = (extra: object = {}) => lookupManPage({ name: 'tar', section: '1', distro: 'debian', release: 'en1', translation, ...extra })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchRelated.mockImplementation(async ({ release }: { release?: string }) => ({ items: [], datasetReleaseId: release }))
    mocks.fetchManByNameAndSectionOrAlias.mockResolvedValue(page('en1'))
  })

  it('serves the translation in one read, keyed only when both keys answered', async () => {
    mocks.fetchTranslatedMan.mockResolvedValue({ ...page('de1', 'de'), translation: translated })
    expect(await lookup()).toMatchObject({
      kind: 'page', servedRelease: 'en1',
      translation: { lang: 'de', state: 'translated', englishHasRoute: true, englishIndexable: true, languages: ['en', 'de'] },
    })
    expect(mocks.fetchTranslatedMan).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', section: '1', lang: 'de', english: 'en1', translated: 'de1' })
    expect(mocks.fetchRelated).toHaveBeenCalledWith({ distro: 'debian', name: 'tar', section: '1', lang: 'de', release: 'de1' })
    expect(mocks.fetchManByNameAndSectionOrAlias).not.toHaveBeenCalled()
    // Another translated release, or an answer compared with another English release, is not the key's.
    mocks.fetchTranslatedMan.mockResolvedValue({ ...page('de0', 'de'), translation: translated })
    expect((await lookup()).servedRelease).toBeNull()
    mocks.fetchTranslatedMan.mockResolvedValue({ ...page('de1', 'de'), translation: { ...translated, englishReleaseId: 'en0' } })
    expect((await lookup()).servedRelease).toBeNull()
  })

  it('does not share a drift note compared with another English release (#474)', async () => {
    const withDrift = (englishReleaseId: string) => ({
      ...page('de1', 'de'), translation: translated,
      data: { ...page('de1', 'de').data, translationDrift: { documented: '1.34', english: '1.35', older: true, missingFlags: [], missingCount: 0, englishReleaseId } },
    })
    mocks.fetchTranslatedMan.mockResolvedValue(withDrift('en1'))
    expect((await lookup()).servedRelease).toBe('en1')
    mocks.fetchTranslatedMan.mockResolvedValue(withDrift('en0'))
    expect((await lookup()).servedRelease).toBeNull()
  })

  it('shows English with the claim only on a confirmed miss', async () => {
    mocks.fetchTranslatedMan.mockResolvedValue({ ...page('en1'), translation: { state: 'missing', locale: 'de', translatedReleaseId: 'de1' } })
    expect(await lookup()).toMatchObject({ kind: 'page', translation: { lang: 'de', state: 'missing' }, servedRelease: 'en1' })
    // A miss reported by another translated release than the key's is not shared.
    mocks.fetchTranslatedMan.mockResolvedValue({ ...page('en1'), translation: { state: 'missing', locale: 'de', translatedReleaseId: 'de0' } })
    expect((await lookup()).servedRelease).toBeNull()
  })

  it('serves English privately, without a claim, on an error or an unknown key', async () => {
    mocks.fetchTranslatedMan.mockRejectedValue(new Error('transient'))
    const failed = await lookup()
    expect(failed).toMatchObject({ kind: 'page', servedRelease: null })
    expect(failed).not.toHaveProperty('translation')
    const unknown = await lookup({ translation: { lang: 'de', datasetReleaseId: null, known: false } })
    expect(unknown).toMatchObject({ kind: 'page', servedRelease: null })
    expect(unknown).not.toHaveProperty('translation')
    expect(mocks.fetchTranslatedMan).toHaveBeenCalledTimes(1)
  })

  it('keeps the language on a translated alias', async () => {
    mocks.fetchTranslatedMan.mockResolvedValue({ kind: 'alias', name: 'tar', section: '1', datasetReleaseId: 'de1', translation: { state: 'translated', locale: 'de', englishReleaseId: 'en1' } })
    expect(await lookup({ name: 'gtar' })).toMatchObject({ kind: 'alias', name: 'tar', lang: 'de', servedRelease: 'en1' })
  })
})

describe('translation sitemaps', () => {
  it('lists every language version and annotates English once, in the first language\'s file', () => {
    const items = [{ name: 'tar', section: '1', locales: ['en', 'de', 'fr'] }, { name: 'tail', section: '1', locales: ['en', 'fr'] }]
    const de = translationUrlset('https://betterman.sh', 'debian', 'de', items.slice(0, 1))
    expect(de).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(de.match(/<loc>/g)).toHaveLength(2)
    expect(de).toContain('<loc>https://betterman.sh/man/tar/1</loc>')
    expect(de).toContain('<loc>https://betterman.sh/man/tar/1?lang=de</loc>')
    for (const link of ['hreflang="en" href="https://betterman.sh/man/tar/1"', 'hreflang="de" href="https://betterman.sh/man/tar/1?lang=de"', 'hreflang="fr" href="https://betterman.sh/man/tar/1?lang=fr"', 'hreflang="x-default" href="https://betterman.sh/man/tar/1"']) {
      expect(de).toContain(link)
    }
    const fr = translationUrlset('https://betterman.sh', 'debian', 'fr', items)
    expect(fr).not.toContain('<loc>https://betterman.sh/man/tar/1</loc>')
    expect(fr).toContain('<loc>https://betterman.sh/man/tail/1</loc>')
    // A noindex English page (#445) is neither annotated nor an alternate, and x-default goes with it.
    const noindex = translationUrlset('https://betterman.sh', 'debian', 'de', [{ ...items[0], englishIndexable: false }])
    expect(noindex).not.toContain('<loc>https://betterman.sh/man/tar/1</loc>')
    expect(noindex).not.toContain('hreflang="en"')
    expect(noindex).not.toContain('hreflang="x-default"')
    const ubuntu = translationUrlset('https://betterman.sh', 'ubuntu', 'de', items.slice(0, 1))
    expect(ubuntu).toContain('<loc>https://betterman.sh/man/tar/1?distro=ubuntu&amp;lang=de</loc>')
  })
})
