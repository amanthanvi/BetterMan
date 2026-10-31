import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ action: vi.fn(), keys: [] as string[][], args: [] as unknown[][] }))
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string[]) => (...args: A) => {
    if (key.includes('man-by-name-and-section')) mocks.keys.push(key)
    if (key.includes('man-by-name-and-section')) mocks.args.push(args)
    return fn(...args)
  },
}))
vi.mock('./convexClient', () => ({ getConvexClient: () => mocks }))
import { fetchManByNameAndSectionOrAlias, fetchManMetaByNameAndSection } from './api'
beforeEach(() => { vi.clearAllMocks(); mocks.args.length = 0; mocks.action.mockResolvedValue({ kind: 'page', data: {} }) })
it('normalizes invalid selectors before the persistent cache and Convex arguments', async () => {
  for (const pkg of ['../bad', 'UPPER', 'valid\n', 'x'.repeat(201), '', undefined]) {
    await fetchManByNameAndSectionOrAlias({ distro:'debian', name:'tar', section:'1', pkg })
    expect(mocks.args.at(-1)).toEqual(['debian','tar','1',null,null])
    expect(mocks.action.mock.calls.at(-1)?.[1]).toEqual({distro:'debian',name:'tar',section:'1',reportRelease:true})
  }
  await fetchManByNameAndSectionOrAlias({ distro:'debian',name:'tar',section:'1',pkg:'alternate-perl' })
  expect(mocks.args.at(-1)).toEqual(['debian','tar','1','alternate-perl',null])
})

it('preserves case-specific requests through metadata and content cache arguments', async () => {
  mocks.action.mockResolvedValue({ kind: 'page', data: { page: { sourcePackage: 'ftp.app' } } })
  expect(await fetchManMetaByNameAndSection({ distro: 'debian', name: 'FTP', section: '1' })).toEqual({ page: { sourcePackage: 'ftp.app' } })
  expect(mocks.args.at(-1)).toEqual(['debian', 'FTP', '1', null, null])
  expect(mocks.action.mock.calls.at(-1)?.[1]).toEqual({ distro: 'debian', name: 'FTP', section: '1', reportRelease: true })
})


it('uses v7 to discard cached responses without combined demand/provider robots data', async () => {
  await fetchManByNameAndSectionOrAlias({ distro: 'debian', name: 'tar', section: '1' })
  expect(mocks.keys.at(-1)).toContain('v7')
})
