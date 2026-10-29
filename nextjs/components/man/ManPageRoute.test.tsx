import type { GetServerSidePropsContext } from 'next'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => ({ lookupManPage: vi.fn(), manMiss: vi.fn(), resolveManName: vi.fn() }))
vi.mock('../../lib/manLookup', () => lookup)

import ManNameRoute, { getServerSideProps as nameProps } from '../../pages/man/[name]/index'
import ManPageRoute, { config, getServerSideProps as pageProps } from '../../pages/man/[name]/[section]'
import { encodeReleaseHeader } from '../../lib/manRelease'

process.env.BM_RELEASE_TOKEN = 'test-release-token'

const release = { datasetReleaseId: '2026-10-28+debian', distro: 'debian' as const, pageCount: 7, lastUpdated: '2026-10-28T00:00:00Z' }
const page = {
  id: 'p1', name: 'tar', section: '1', title: 'an archiving utility', description: 'an archiving utility',
  datasetReleaseId: '2026-10-28+debian', sourcePackage: 'tar', sourcePackageVersion: '1.35', hasParseWarnings: false,
}
const data = { page, content: { blocks: [], toc: [], synopsis: [], options: [], seeAlso: [] }, variants: [] }

function context(path: { name: string; section?: string }, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const res = { statusCode: 200, headers: {} as Record<string, string>, setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value } }
  const ctx = {
    params: path,
    query,
    req: { headers: { 'x-bm-release': encodeReleaseHeader(release), 'x-bm-release-token': 'test-release-token', ...headers } },
    res,
  } as unknown as GetServerSidePropsContext
  return { ctx, res }
}

function propsOf(result: object): object {
  if (!('props' in result)) throw new Error('Expected props')
  return result.props as object
}

beforeEach(() => {
  vi.clearAllMocks()
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data, related: [] })
  lookup.manMiss.mockImplementation(async (opts: object) => ({ ...opts, suggestions: [], distros: [], limited: false }))
})

it('carries its head to the document: canonical, share image, JSON-LD and the index tier', async () => {
  const result = await pageProps(context({ name: 'tar', section: '1' }, { distro: 'ubuntu' }).ctx)
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, page: { ...page, indexable: false } }, related: [] })
  const tail = await pageProps(context({ name: 'tar', section: '1' }).ctx)
  expect(propsOf(result)).toMatchObject({
    head: {
      title: 'tar(1) - BetterMan',
      canonical: 'http://localhost:3000/man/tar/1',
      ogImage: { url: 'http://localhost:3000/man/tar/1/og' },
      noindex: false,
    },
  })
  expect(propsOf(tail)).toMatchObject({ head: { noindex: true } })
  expect(JSON.parse((propsOf(result) as { head: { jsonLd: { json: string } } }).head.jsonLd.json)).toMatchObject({ '@type': 'TechArticle' })
})

it('turns off the Next runtime, so the page is plain HTML', () => {
  expect(config).toMatchObject({ unstable_runtimeJS: false })
})

describe('/man/<name>/<section>', () => {
  it('renders from the URL and the release only: a cookie changes nothing', async () => {
    const plain = context({ name: 'tar', section: '1' })
    const cookie = context({ name: 'tar', section: '1' }, {}, { cookie: 'bm-distro=ubuntu' })
    const [a, b] = [await pageProps(plain.ctx), await pageProps(cookie.ctx)]
    expect(a).toEqual(b)
    expect(lookup.lookupManPage).toHaveBeenCalledWith({ name: 'tar', section: '1', distro: 'debian', release: '2026-10-28+debian' })
    expect(plain.res.headers['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(plain.res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
  })

  it('renders the manual with a canonical URL, JSON-LD and the man page script', async () => {
    const { ctx } = context({ name: 'tar', section: '1' }, { distro: 'ubuntu' })
    lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'ubuntu', data, related: [] })
    const result = await pageProps(ctx)
    const html = renderToStaticMarkup(ManPageRoute(propsOf(result) as Parameters<typeof ManPageRoute>[0]))
    expect(html).toContain('data-bm-manual')
    expect(html).toContain('<script defer="" src="/_bm/man.js"></script>')
    expect(html).toContain('href="/?distro=ubuntu"')
    expect(html).not.toContain('nonce')
  })

  it('ignores a release header the proxy did not set, so a client cannot pick the cache key', async () => {
    const forged = context({ name: 'tar', section: '1' }, {}, { 'x-bm-release-token': 'guess' })
    await pageProps(forged.ctx)
    expect(forged.res.headers['cache-control']).toBe('private, no-store')
    expect(lookup.lookupManPage).toHaveBeenCalledWith({ name: 'tar', section: '1', distro: 'debian' })
  })

  it('does not share a page served from another release than its key', async () => {
    lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, page: { ...page, datasetReleaseId: '2026-10-29+debian' } }, related: [] })
    const { ctx, res } = context({ name: 'tar', section: '1' })
    await pageProps(ctx)
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('does not share a response that lacks the release key', async () => {
    const { ctx, res } = context({ name: 'tar', section: '1' })
    delete (ctx.req.headers as Record<string, unknown>)['x-bm-release']
    await pageProps(ctx)
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['cdn-cache-control']).toBeUndefined()
    expect(lookup.lookupManPage).toHaveBeenCalledWith({ name: 'tar', section: '1', distro: 'debian' })
  })

  it('answers a miss with a real 404 in man’s voice, and keeps a rate-limited one private', async () => {
    lookup.lookupManPage.mockResolvedValue(null)
    const { ctx, res } = context({ name: 'ta', section: '9' })
    const result = await pageProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(res.headers['cdn-cache-control']).toBe('public, s-maxage=600, stale-while-revalidate=3600')
    const html = renderToStaticMarkup(ManPageRoute(propsOf(result) as Parameters<typeof ManPageRoute>[0]))
    expect(html).toContain('No manual entry for ta in section 9')
    expect(html).not.toContain('data-bm-manual')

    lookup.manMiss.mockImplementation(async (opts: object) => ({ ...opts, suggestions: [], distros: [], limited: true }))
    const limited = context({ name: 'ta', section: '9' })
    await pageProps(limited.ctx)
    expect(limited.res.headers['cache-control']).toBe('private, no-store')
    expect(limited.res.headers['cdn-cache-control']).toBeUndefined()
  })

  it('redirects a .so alias, permanently only for an explicit distro', async () => {
    lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1', distro: 'debian' })
    await expect(pageProps(context({ name: 'gunzip', section: '1' }).ctx)).resolves.toEqual({ redirect: { destination: '/man/gzip/1', permanent: false } })
    await expect(pageProps(context({ name: 'gunzip', section: '1' }, { distro: 'debian' }).ctx)).resolves.toEqual({
      redirect: { destination: '/man/gzip/1?distro=debian', permanent: true },
    })
    lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'foo::bar', section: '3pm', pkg: 'alternate-perl', distro: 'debian' })
    await expect(pageProps(context({ name: 'foo::stub', section: '3pm' }).ctx)).resolves.toEqual({
      redirect: { destination: '/man/foo%3A%3Abar/3pm?pkg=alternate-perl', permanent: false },
    })
  })
})

describe('/man/<name>', () => {
  it('redirects to the only section and renders a picker for several', async () => {
    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' } })
    await expect(nameProps(context({ name: 'tar' }, { distro: 'ubuntu' }).ctx)).resolves.toEqual({ redirect: { destination: '/man/tar/1?distro=ubuntu', permanent: false } })

    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'ambiguous', options: [{ section: '1', description: 'format' }, { section: '3', description: 'formatted output' }] } })
    const result = await nameProps(context({ name: 'printf' }).ctx)
    const html = renderToStaticMarkup(ManNameRoute(propsOf(result) as Parameters<typeof ManNameRoute>[0]))
    expect(html).toContain('href="/man/printf/1"')
    expect(html).toContain('href="/man/printf/3"')
  })

  it('answers a missing name with a 404', async () => {
    lookup.resolveManName.mockResolvedValue(null)
    const { ctx, res } = context({ name: 'gizp' })
    await nameProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(lookup.manMiss).toHaveBeenCalledWith(expect.objectContaining({ name: 'gizp', section: null, distro: 'debian', urlDistro: null }))
  })
})
