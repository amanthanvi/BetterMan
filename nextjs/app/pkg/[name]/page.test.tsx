import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetchPackage: vi.fn(), withDistroFallback: vi.fn(), notFound: vi.fn(() => { throw new Error('404') }), redirect: vi.fn((location: string) => { throw new Error(`REDIRECT:${location}`) }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ host: 'localhost:3000' }) }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('../../../lib/api', () => ({ fetchPackage: mocks.fetchPackage, withDistroFallback: mocks.withDistroFallback, FastApiError: class extends Error {} }))
import PackagePage, { generateMetadata } from './page'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.example')
  mocks.withDistroFallback.mockImplementation(async (distro, fn) => ({ distro, data: await fn(distro) }))
})
afterEach(() => vi.unstubAllEnvs())
it('renders package/version/pages and preserves the distro and cursor on next page links', async () => {
  mocks.fetchPackage.mockResolvedValue({ name: 'libX11', version: '1.8', pages: [{ name: 'XOpenDisplay', section: '3', title: 'XOpenDisplay(3)', description: 'connect to X server' }], hasMore: true, nextCursor: 'next+cursor' })
  const html = renderToStaticMarkup(await PackagePage({ params: Promise.resolve({ name: 'libX11' }), searchParams: Promise.resolve({ distro: 'freebsd' }) }))
  expect(mocks.fetchPackage).toHaveBeenCalledWith({ distro: 'freebsd', name: 'libX11', cursor: undefined })
  expect(html).toContain('libX11')
  expect(html).toContain('1.8')
  expect(html).toContain('/man/XOpenDisplay/3?distro=freebsd')
  // The citation appears once, as the link; the description follows it.
  expect(html).toContain('connect to X server')
  expect(html.split('XOpenDisplay(3)')).toHaveLength(2)
  expect(html).toContain('/pkg/libX11?distro=freebsd&amp;cursor=next%2Bcursor')
})
it('returns 404 for an unknown package and keeps a valid empty cursor page readable', async () => {
  mocks.fetchPackage.mockResolvedValue({ name: 'unknown', version: null, pages: [], hasMore: false, nextCursor: null })
  await expect(PackagePage({ params: Promise.resolve({ name: 'unknown' }), searchParams: Promise.resolve({}) })).rejects.toThrow('404')
  expect(renderToStaticMarkup(await PackagePage({ params: Promise.resolve({ name: 'unknown' }), searchParams: Promise.resolve({ cursor: 'end' }) }))).toContain('unknown')
})

it('uses the served distro after an uninitialized preference falls back', async () => {
  mocks.withDistroFallback.mockResolvedValue({ distro: 'debian', data: {
    name: 'tar', version: '1.35', pages: [{ name: 'tar', section: '1', title: 'archive' }], hasMore: true, nextCursor: 'next',
  } })
  const html = renderToStaticMarkup(await PackagePage({ params: Promise.resolve({ name: 'tar' }), searchParams: Promise.resolve({ distro: 'arch' }) }))
  expect(mocks.withDistroFallback).toHaveBeenCalledWith('arch', expect.any(Function))
  expect(html).toContain('debian')
  expect(html).toContain('/man/tar/1?distro=debian')
  expect(html).toContain('/pkg/tar?distro=debian&amp;cursor=next')
})

it.each(['invalid', 'stale'])('redirects a %s cursor to the first page in the served distro', async (cursorReset) => {
  mocks.fetchPackage.mockResolvedValue({ name: 'tar', version: '1.35', pages: [{ name: 'tar', section: '1', title: 'archive' }], cursorReset, hasMore: false, nextCursor: null })
  await expect(PackagePage({ params: Promise.resolve({ name: 'tar' }), searchParams: Promise.resolve({ distro: 'ubuntu', cursor: 'garbage' }) })).rejects.toThrow('REDIRECT:/pkg/tar?distro=ubuntu')
  expect(mocks.redirect).toHaveBeenCalledWith('/pkg/tar?distro=ubuntu')
})
it('sets a package title and stable first-page canonical, and noindexes cursor pages', async () => {
  mocks.fetchPackage.mockResolvedValue({ name: 'libX11', version: '1.8', pages: [{ name: 'XOpenDisplay', section: '3' }] })
  const props = { params: Promise.resolve({ name: 'libX11' }), searchParams: Promise.resolve({ distro: 'freebsd', cursor: 'cursor' }) }
  expect(await generateMetadata(props)).toMatchObject({
    title: 'libX11 package — BetterMan',
    alternates: { canonical: 'https://betterman.example/pkg/libX11?distro=freebsd' },
    robots: { index: false, follow: true },
  })
  expect(mocks.fetchPackage).toHaveBeenCalledWith({ distro: 'freebsd', name: 'libX11' })
  const first = await generateMetadata({ params: Promise.resolve({ name: 'libX11' }), searchParams: Promise.resolve({}) })
  expect(first.alternates?.canonical).toBe('https://betterman.example/pkg/libX11')
  expect(first.robots).toBeUndefined()
})
it('uses the served distro for canonical metadata after a missing release falls back', async () => {
  mocks.withDistroFallback.mockResolvedValue({ distro: 'debian', data: { name: 'tar', version: '1.35', pages: [{ name: 'tar', section: '1' }] } })
  const metadata = await generateMetadata({ params: Promise.resolve({ name: 'tar' }), searchParams: Promise.resolve({ distro: 'arch' }) })
  expect(metadata.alternates?.canonical).toBe('https://betterman.example/pkg/tar')
})
it('noindexes an unknown package', async () => {
  mocks.fetchPackage.mockResolvedValue({ name: 'unknown', version: null, pages: [] })
  expect(await generateMetadata({ params: Promise.resolve({ name: 'unknown' }), searchParams: Promise.resolve({}) })).toMatchObject({ title: 'Package not found — BetterMan', robots: { index: false, follow: false } })
})
