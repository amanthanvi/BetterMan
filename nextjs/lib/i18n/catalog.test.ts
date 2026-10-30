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
              const needed = lang === 'ru' ? ['few', 'many', 'one', 'other'] : ['other']
              for (const form of needed) expect(pluralForms(text), `${key} needs ${form}`).toContain(form)
            }
          }
        })
      }

      it('is marked with its own language, who translated it and its review state', () => {
        const meta = CATALOG_META[lang]
        expect(meta.lang).toBe(lang)
        expect(meta.translatedBy).toBeTruthy()
        expect(meta.status).toBe('reviewed')
        expect(meta.reviewedBy.length).toBeGreaterThan(0)
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
