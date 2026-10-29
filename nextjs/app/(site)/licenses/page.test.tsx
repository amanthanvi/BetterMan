import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cookieDistro: undefined as string | undefined, fetchLicenses: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT;307;${url}`) }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => mocks.cookieDistro ? { value: mocks.cookieDistro } : undefined }) }))
vi.mock('./LicensesClient', () => ({ LicensesClient: () => null }))
vi.mock('../../../lib/api', async original => ({
  ...await original<typeof import('../../../lib/api')>(),
  fetchLicenses: mocks.fetchLicenses,
}))
import { FastApiError } from '../../../lib/api'
import LicensesPage from './page'

beforeEach(() => { vi.clearAllMocks(); mocks.cookieDistro = undefined })
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

it.each([{}, { distro: 'invalid' }])('keeps recovery links bare when the distro came from a cookie: %j', async sp => {
  mocks.cookieDistro = 'ubuntu'
  mocks.fetchLicenses.mockRejectedValue(new FastApiError(503, 'RELEASE_CHANGED', 'retry'))
  await expect(LicensesPage({ searchParams: Promise.resolve(sp) })).rejects.toThrow('NEXT_REDIRECT;307;/licenses')
  expect(mocks.redirect).toHaveBeenCalledWith('/licenses')
  expect(mocks.fetchLicenses).toHaveBeenCalledWith({ distro: 'ubuntu' })
})
