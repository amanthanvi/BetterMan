import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetchLicenses: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT;307;${url}`) }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('./LicensesClient', () => ({ LicensesClient: () => null }))
vi.mock('../../../lib/api', async original => ({
  ...await original<typeof import('../../../lib/api')>(),
  fetchLicenses: mocks.fetchLicenses,
}))
import { FastApiError } from '../../../lib/api'
import LicensesPage from './page'

beforeEach(() => vi.clearAllMocks())
it('redirects repeated promotion changes to a fresh license request', async () => {
  mocks.fetchLicenses.mockRejectedValue(new FastApiError(503, 'RELEASE_CHANGED', 'retry'))
  await expect(LicensesPage({ searchParams: Promise.resolve({ distro: 'ubuntu' }) }))
    .rejects.toThrow('NEXT_REDIRECT;307;/licenses?distro=ubuntu')
})
it('preserves unrelated license errors', async () => {
  mocks.fetchLicenses.mockRejectedValue(new Error('backend unavailable'))
  await expect(LicensesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('backend unavailable')
  expect(mocks.redirect).not.toHaveBeenCalled()
})
