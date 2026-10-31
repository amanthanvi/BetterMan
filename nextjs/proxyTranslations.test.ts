import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

const release = vi.hoisted(() => ({ servingRelease: vi.fn(), servingReleases: vi.fn() }))
vi.mock('./lib/manRelease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/manRelease')>()),
  servingRelease: release.servingRelease,
  servingReleases: release.servingReleases,
}))

process.env.BM_RELEASE_TOKEN = 'test-release-token'
import { proxy } from './proxy'
import { trustedTranslation } from './lib/manRelease'

const releaseFor = (distro: string) => ({ datasetReleaseId: `en+${distro}`, distro, pageCount: 10, lastUpdated: '2026-10-30T00:00:00Z' })

beforeEach(() => {
  release.servingRelease.mockReset().mockImplementation(async (distro: string) => releaseFor(distro))
  release.servingReleases.mockReset().mockImplementation(async (distro: string, lang: string) => ({
    release: releaseFor(distro), translation: distro === 'debian' ? `${lang}+${distro}` : null,
  }))
})

async function rewrite(url: string, headers: Record<string, string> = {}) {
  const response = await proxy(new NextRequest(url, { headers }))
  const forwarded = Object.fromEntries(
    [...response.headers].filter(([key]) => key.startsWith('x-middleware-request-')).map(([key, value]) => [key.slice('x-middleware-request-'.length), value]),
  )
  const target = response.headers.get('x-middleware-rewrite')
  return { status: response.status, key: target ? new URL(target).searchParams.get('__bm_release') : null, forwarded }
}

it('keys a translated man page on the English and the language release, read in one call (#395)', async () => {
  const { key, forwarded } = await rewrite('https://betterman.sh/man/tar/1?lang=de')
  expect(key).toBe('en+debian~de:de+debian')
  expect(release.servingReleases).toHaveBeenCalledTimes(1)
  expect(release.servingReleases).toHaveBeenCalledWith('debian', 'de')
  expect(release.servingRelease).not.toHaveBeenCalled()
  expect(trustedTranslation(forwarded)).toEqual({ lang: 'de', datasetReleaseId: 'de+debian', known: true })
})

it('keys a language without a release, and a failed lookup, apart from English', async () => {
  expect((await rewrite('https://betterman.sh/man/tar/1?distro=ubuntu&lang=pt-BR')).key).toBe('en+ubuntu~pt-BR:none')
  release.servingReleases.mockResolvedValueOnce(undefined)
  const failed = await rewrite('https://betterman.sh/man/tar/1?lang=ja')
  expect(failed.key).toBe('unknown~ja:unknown')
  expect(trustedTranslation(failed.forwarded)).toEqual({ lang: 'ja', datasetReleaseId: null, known: false })
})

it('redirects English, miscased and unknown codes through the man URL allowlist', async () => {
  for (const url of ['https://betterman.sh/man/tar/1?lang=en', 'https://betterman.sh/man/tar/1?lang=pt-br', 'https://betterman.sh/man/tar/1?lang=xx']) {
    expect((await rewrite(url)).status).toBe(308)
  }
  expect(release.servingReleases).not.toHaveBeenCalled()
})

it('drops a forged translation header, and plain text ignores the language', async () => {
  const { key, forwarded } = await rewrite('https://betterman.sh/man/tar/1', { 'x-bm-translation-release': JSON.stringify({ lang: 'de', datasetReleaseId: 'forged', known: true }) })
  expect(key).toBe('en+debian')
  expect(forwarded['x-bm-translation-release']).toBeUndefined()
  const text = await rewrite('https://betterman.sh/man/tar/1.txt?lang=de')
  expect(text.key).toBe('en+debian')
  expect(release.servingReleases).not.toHaveBeenCalled()
})

it('trusts a translation header only beside the proxy token', () => {
  const header = JSON.stringify({ lang: 'fr', datasetReleaseId: 'fr+debian', known: true })
  expect(trustedTranslation({ 'x-bm-release': JSON.stringify(releaseFor('debian')), 'x-bm-translation-release': header })).toBeNull()
  expect(trustedTranslation({
    'x-bm-release': JSON.stringify(releaseFor('debian')), 'x-bm-release-token': 'test-release-token', 'x-bm-translation-release': header,
  })).toEqual({ lang: 'fr', datasetReleaseId: 'fr+debian', known: true })
  expect(trustedTranslation({
    'x-bm-release': 'unknown', 'x-bm-release-token': 'test-release-token', 'x-bm-translation-release': JSON.stringify({ lang: 'en', known: true }),
  })).toBeNull()
})
