import { describe, expect, it } from 'vitest'

import { client as enClient } from './catalog/en/client'
import { common as enCommon } from './catalog/en/common'
import { man as enMan } from './catalog/en/man'
import { server as enServer } from './catalog/en/server'
import { CATALOG_META } from './gate'
import { LANGS, type TranslatedLang } from './locales'
import { loadCatalog } from './server'

const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)(?=[,}])/g)].map((m) => m[1]).filter((name) => !['one', 'few', 'many', 'other'].includes(name)))].sort()
const pluralForms = (text: string) => [...new Set([...text.matchAll(/\b(one|few|many|other)\s*\{/g)].map((m) => m[1]))].sort()

// A message is its English text, so the catalogs list texts and a translation is keyed by them.
const GROUPS = [
  ['client', enClient],
  ['server', enServer],
  ['man', enMan],
] as const

describe('every translation is complete and keeps what the code fills in', () => {
  for (const lang of LANGS.filter((l): l is TranslatedLang => l !== 'en')) {
    describe(lang, () => {
      for (const [group, english] of GROUPS) {
        it(`has the English ${group} keys, no more, with the same placeholders`, async () => {
          const translated = (await loadCatalog(lang))[group] as Record<string, string>
          expect(Object.keys(translated).sort()).toEqual([...new Set(english)].sort())
          for (const key of english) {
            const source = key.slice(key.indexOf('\u0004') + 1)
            const text = translated[key]
            expect(text.trim(), key).not.toBe('')
            expect(placeholders(text), key).toEqual(placeholders(source))
            if (source.includes('plural,')) {
              const needed = ['ru', 'pl'].includes(lang) ? ['few', 'many', 'one', 'other'] : lang === 'ro' ? ['few', 'one', 'other'] : ['other']
              for (const form of needed) expect(pluralForms(text), `${key} needs ${form}`).toContain(form)
            }
          }
        })
      }

      it('is marked with its own language, who translated it and its review state', () => {
        const meta = CATALOG_META[lang]
        expect(meta.lang).toBe(lang)
        expect(meta.translatedBy).toBeTruthy()
        if (lang === 'ro' || lang === 'pl') {
          expect(meta.status).toBe('needs-review')
          expect(meta.reviewedBy).toEqual(['Claude Opus 5.5 (model panel)', 'Grok 4.7 (model panel)'])
          expect(meta.reviewedOn).toBe('2026-11-10')
        } else {
          expect(meta.status).toBe('reviewed')
          expect(meta.reviewedBy.length).toBeGreaterThan(0)
        }
      })
    })
  }
})

it('lists a message once per group', () => {
  for (const list of [enCommon, enClient, enMan, enServer]) expect(new Set(list).size).toBe(list.length)
})

it('knows English without a catalog: the message is the text', async () => {
  const english = await loadCatalog('en')
  expect(english).toEqual({ client: {}, server: {}, man: {} })
})

it('uses Polish and Romanian plural rules for page counts', async () => {
  const { makeT } = await import('./translate')
  const key = '{count, plural, one {# page} other {# pages}}'
  const pl = makeT('pl', (await loadCatalog('pl')).client)
  for (const [count, expected] of [[1, '1 strona'], [2, '2 strony'], [5, '5 stron'], [12, '12 stron'], [22, '22 strony']] as const) {
    expect(pl(key, { count })).toBe(expected)
  }
  const ro = makeT('ro', (await loadCatalog('ro')).client)
  for (const [count, expected] of [[1, '1 pagină'], [2, '2 pagini'], [20, '20 de pagini']] as const) {
    expect(ro(key, { count })).toBe(expected)
  }
  for (const group of Object.values(await loadCatalog('ro'))) {
    for (const text of Object.values(group)) expect(text).not.toMatch(/[şţŞŢ]/)
  }
})

it.each(['ro', 'pl'] as const)('keeps the %s visible bookmark label inside both accessible names', async (lang) => {
  const { server, man } = await loadCatalog(lang)
  const visible = server.Bookmark
  expect(man['Bookmark {citation}']).toContain(visible)
  expect(man['man.bookmarkRemoveLabel\u0004Remove bookmark for {citation}']).toContain(visible)
})
