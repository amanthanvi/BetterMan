import { beforeEach, expect, it, vi } from 'vitest'

const convex = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('./convexClient', () => ({ getConvexClient: () => convex }))

import { createHash } from 'node:crypto'

import { MAN_BOOT_SCRIPT, manBootScriptHash } from './manBoot'
import { decodeReleaseHeader, encodeReleaseHeader, RELEASE_TTL_MS, resetReleaseCache, servingRelease, trustedRelease } from './manRelease'

const info = (distro: string, datasetReleaseId = `2026-10-28+${distro}`) => ({ datasetReleaseId, distro, locale: 'en', pageCount: 7, lastUpdated: '2026-10-28T00:00:00Z' })

beforeEach(() => {
  resetReleaseCache()
  convex.query.mockReset()
  convex.query.mockImplementation(async (_ref: unknown, { distro }: { distro: string }) => info(distro))
})

it('asks Convex once per distro per TTL, then again after it', async () => {
  await expect(servingRelease('ubuntu', 0)).resolves.toMatchObject({ datasetReleaseId: '2026-10-28+ubuntu', distro: 'ubuntu', pageCount: 7 })
  await servingRelease('ubuntu', RELEASE_TTL_MS - 1)
  expect(convex.query).toHaveBeenCalledTimes(1)
  convex.query.mockResolvedValueOnce(info('ubuntu', '2026-10-29+ubuntu'))
  await expect(servingRelease('ubuntu', RELEASE_TTL_MS)).resolves.toMatchObject({ datasetReleaseId: '2026-10-29+ubuntu' })
  expect(convex.query).toHaveBeenCalledTimes(2)
})

it("keys a distro without a release on Debian's, which its pages fall back to", async () => {
  convex.query.mockImplementation(async (_ref: unknown, { distro }: { distro: string }) => (distro === 'arch' ? info('arch', 'uninitialized') : info(distro)))
  await expect(servingRelease('arch', 0)).resolves.toMatchObject({ datasetReleaseId: '2026-10-28+debian', distro: 'debian' })
})

it('remembers a failed read for the TTL rather than retrying every view', async () => {
  convex.query.mockRejectedValue(new Error('down'))
  await expect(servingRelease('debian', 0)).resolves.toBeNull()
  await expect(servingRelease('debian', 1)).resolves.toBeNull()
  expect(convex.query).toHaveBeenCalledTimes(1)
})

it('round-trips the forwarded header and rejects anything malformed', () => {
  const release = { datasetReleaseId: 'r1', distro: 'debian' as const, pageCount: 3, lastUpdated: '2026-10-28T00:00:00Z' }
  expect(decodeReleaseHeader(encodeReleaseHeader(release))).toEqual(release)
  for (const bad of [undefined, '', 'not json', '{}', '{"datasetReleaseId":"r1","distro":"nope","pageCount":1,"lastUpdated":""}', '{"datasetReleaseId":"r1","distro":"debian","pageCount":"1","lastUpdated":""}']) {
    expect(decodeReleaseHeader(bad)).toBeNull()
  }
})

it('hashes the boot script exactly as the CSP needs it', async () => {
  await expect(manBootScriptHash()).resolves.toBe(`'sha256-${createHash('sha256').update(MAN_BOOT_SCRIPT).digest('base64')}'`)
})

it('trusts a forwarded release only with the proxy token', () => {
  process.env.BM_RELEASE_TOKEN = 'secret-token'
  const header = encodeReleaseHeader({ datasetReleaseId: 'r1', distro: 'debian', pageCount: 3, lastUpdated: '2026-10-28T00:00:00Z' })
  expect(trustedRelease({ 'x-bm-release': header, 'x-bm-release-token': 'secret-token' })).toMatchObject({ datasetReleaseId: 'r1' })
  expect(trustedRelease({ 'x-bm-release': header })).toBeNull()
  expect(trustedRelease({ 'x-bm-release': header, 'x-bm-release-token': 'secret-tokem' })).toBeNull()
  delete process.env.BM_RELEASE_TOKEN
  expect(trustedRelease({ 'x-bm-release': header, 'x-bm-release-token': '' })).toBeNull()
})
