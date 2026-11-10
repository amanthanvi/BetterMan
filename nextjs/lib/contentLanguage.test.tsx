import { holdBack, releaseHeld } from './i18n/testing'
import { afterEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ search: vi.fn(), fetchInfo: vi.fn(), listSections: vi.fn() }))
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), ...api }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }))
import HomePage from '../app/(site)/page'
import SearchPage from '../app/search/page'

afterEach(() => {
  vi.unstubAllEnvs()
  releaseHeld()
})
it.each(['ro', 'pl'] as const)('gates %s content on home and search, including previews', async (lang) => {
  holdBack(lang)
  api.fetchInfo.mockResolvedValue({ pageCount: 1, lastUpdated: '2026-11-10' })
  api.listSections.mockResolvedValue([])
  api.search.mockResolvedValue({ results: [], suggestions: [], total: 0 })
  for (const page of [HomePage, SearchPage]) {
    for (const preview of ['', lang]) {
      vi.stubEnv('BM_I18N_PREVIEW', preview)
      await page({ searchParams: Promise.resolve({ q: 'tar', lang }) })
      const args = api.search.mock.calls.at(-1)?.[0]
      expect(args).toBeTruthy()
      if (preview) expect(args).toHaveProperty('lang', lang)
      else expect(args).not.toHaveProperty('lang')
    }
  }
})
