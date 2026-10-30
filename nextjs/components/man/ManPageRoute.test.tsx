import type { GetServerSidePropsContext } from 'next'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const limiter = vi.hoisted(() => ({ isRateLimited: vi.fn() }))
vi.mock('../../lib/rateLimit', () => limiter)

const lookup = vi.hoisted(() => ({ lookupManPage: vi.fn(), manMiss: vi.fn(), resolveManName: vi.fn() }))
vi.mock('../../lib/manLookup', () => lookup)

import ManNameRoute, { getServerSideProps as nameProps } from '../../pages/man/[name]/index'
import ManPageRoute, { config, getServerSideProps as pageProps } from '../../pages/man/[name]/[section]'
import { encodeReleaseHeader } from '../../lib/manRelease'
import { ManHeadTags, type ManHeadData } from './ManHead'

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
  limiter.isRateLimited.mockResolvedValue(false)
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data, related: [], servedRelease: '2026-10-28+debian' })
  lookup.manMiss.mockImplementation(async (opts: object) => ({ ...opts, suggestions: [], distros: [], limited: false, answeredByKey: true }))
})

it('carries its head to the document: canonical, share image, JSON-LD and the index tier', async () => {
  const result = await pageProps(context({ name: 'tar', section: '1' }, { distro: 'ubuntu' }).ctx)
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, page: { ...page, indexable: false } }, related: [], servedRelease: '2026-10-28+debian' })
  const tail = await pageProps(context({ name: 'tar', section: '1' }).ctx)
  expect(propsOf(result)).toMatchObject({
    head: {
      title: 'tar(1) — BetterMan',
      canonical: 'http://localhost:3000/man/tar/1',
      ogImage: { url: 'http://localhost:3000/man/tar/1/og' },
      noindex: false,
    },
  })
  expect(propsOf(tail)).toMatchObject({ head: { noindex: true } })
  expect(JSON.parse((propsOf(result) as { head: { jsonLd: { json: string } } }).head.jsonLd.json)).toMatchObject({ '@type': 'TechArticle' })
})

it('shares one option for ?flag= under the page canonical, and ignores a flag the page does not define', async () => {
  const options = [{ anchorId: 'opt-x', flags: '-x, --extract', description: 'Extract files from an archive.' }]
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, content: { ...data.content, options } }, related: [], servedRelease: '2026-10-28+debian' })
  const shared = propsOf(await pageProps(context({ name: 'tar', section: '1' }, { flag: '--extract' }).ctx)) as { head: Record<string, unknown> }
  expect(shared.head).toMatchObject({
    title: 'tar(1) — BetterMan',
    canonical: 'http://localhost:3000/man/tar/1',
    ogImage: { url: 'http://localhost:3000/man/tar/1/og?flag=--extract', alt: '-x, --extract in tar(1)' },
    share: { title: 'tar --extract · tar(1) — BetterMan', description: 'Extract files from an archive.' },
  })
  const cached = context({ name: 'tar', section: '1' }, { flag: '--extract' })
  await pageProps(cached.ctx)
  expect(cached.res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')

  // A flag this release's page does not define is dropped by a private redirect, keeping the rest.
  for (const flag of ['-q', 'extract', '--extract=X']) {
    const { ctx, res } = context({ name: 'tar', section: '1' }, { flag, distro: 'ubuntu', pkg: 'tar', portability: 'text', lang: 'de' })
    expect(await pageProps(ctx)).toEqual({ redirect: { destination: '/man/tar/1?distro=ubuntu&pkg=tar&portability=text&lang=de', permanent: false } })
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['cdn-cache-control']).toBeUndefined()
  }
})

it('answers privately a query the proxy would have redirected, should one reach the renderer', async () => {
  for (const query of [{ zz: '1' }, { distro: ['ubuntu', 'fedora'] }, { portability: 'glyph' }, { lang: 'en' }] as Record<string, string | string[]>[]) {
    const { ctx, res } = context({ name: 'tar', section: '1' }, query as Record<string, string>)
    await pageProps(ctx)
    expect(res.headers['cache-control'], JSON.stringify(query)).toBe('private, no-store')
  }
  const own = context({ name: 'tar', section: '1' }, { name: 'tar', section: '1', __bm_release: '2026-10-28+debian', portability: 'text' })
  await pageProps(own.ctx)
  expect(own.res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')

  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: '2026-10-28+debian' })
  const picker = context({ name: 'tar' }, { utm_source: 'hn' })
  await nameProps(picker.ctx)
  expect(picker.res.headers['cache-control']).toBe('private, no-store')
})

it.each(['random1', 'random2', 'no-such-package'])('keeps every HTML answer to the made-up package %s private, name-only and with a section', async (pkg) => {
  lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: '2026-10-28+debian' })
  const page = context({ name: 'tar', section: '1' }, { pkg })
  await pageProps(page.ctx)
  expect(page.res.statusCode).toBe(404)
  expect(page.res.headers['cache-control']).toBe('private, no-store')

  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: '2026-10-28+debian' })
  const name = context({ name: 'tar' }, { pkg })
  await expect(nameProps(name.ctx)).resolves.toEqual({ redirect: { destination: `/man/tar/1?pkg=${pkg}`, permanent: false } })
  expect(name.res.headers['cache-control']).toBe('private, no-store')
})

it('answers a request that arrived with a bare _rsc privately, on both man renderers', async () => {
  const bare = context({ name: 'tar', section: '1' })
  ;(bare.ctx.req as unknown as { url: string }).url = '/man/tar/1?_rsc=abc'
  await pageProps(bare.ctx)
  expect(bare.res.headers['cache-control']).toBe('private, no-store')

  const client = context({ name: 'tar', section: '1' }, {}, { rsc: '1' })
  ;(client.ctx.req as unknown as { url: string }).url = '/man/tar/1?_rsc=abc'
  await pageProps(client.ctx)
  expect(client.res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')

  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: '2026-10-28+debian' })
  const name = context({ name: 'tar' })
  ;(name.ctx.req as unknown as { url: string }).url = '/man/tar?_rsc=abc'
  await nameProps(name.ctx)
  expect(name.res.headers['cache-control']).toBe('private, no-store')
})

it('keeps every answer to an unproven package or flag out of the CDN', async () => {
  lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: '2026-10-28+debian' })
  for (const query of [{ pkg: 'made-up' }, { flag: '-x' }, {}] as Record<string, string>[]) {
    const { ctx, res } = context({ name: 'tar', section: '1' }, query)
    await pageProps(ctx)
    expect(res.statusCode).toBe(404)
    if (Object.keys(query).length) expect(res.headers['cache-control'], JSON.stringify(query)).toBe('private, no-store')
    else expect(res.headers['cdn-cache-control']).toBe('public, s-maxage=600, stale-while-revalidate=3600')
  }

  lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1', servedRelease: '2026-10-28+debian' })
  const alias = context({ name: 'gunzip', section: '1' }, { pkg: 'made-up' })
  await pageProps(alias.ctx)
  expect(alias.res.headers['cache-control']).toBe('private, no-store')
})

it('prints the running head and foot: name, section label, edition, system and release day', async () => {
  const result = propsOf(await pageProps(context({ name: 'tar', section: '1' }).ctx)) as { head: Record<string, unknown> }
  expect(result.head.print).toEqual({ head: ['TAR(1)', 'User Commands', 'TAR(1)'], foot: ['tar 1.35', 'Debian · Oct 28, 2026'] })
})

it('turns off the Next runtime, so the page is plain HTML', () => {
  expect(config).toMatchObject({ unstable_runtimeJS: false })
})

it.each([undefined, true, false])('renders robots from the existing page tier (%s) without another lookup', async (indexable) => {
  lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, page: { ...page, indexable } }, related: [], servedRelease: release.datasetReleaseId })
  const { ctx, res } = context({ name: 'tar', section: '1' })
  const result = await pageProps(ctx)
  const { head } = propsOf(result) as { head: ManHeadData }
  const html = renderToStaticMarkup(<ManHeadTags {...head} />)
  expect(html.includes('<meta name="robots" content="noindex"/>')).toBe(indexable === false)
  expect(res.headers['x-robots-tag']).toBe(indexable === false ? 'noindex' : undefined)
  expect(html.includes('<link rel="canonical" href="http://localhost:3000/man/tar/1"/>')).toBe(indexable !== false)
  expect(lookup.lookupManPage).toHaveBeenCalledTimes(1)
  expect(lookup.manMiss).not.toHaveBeenCalled()
  expect(res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
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
    lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'ubuntu', data, related: [], servedRelease: '2026-10-28+debian' })
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
    lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'debian', data: { ...data, page: { ...page, datasetReleaseId: '2026-10-29+debian', indexable: false } }, related: [], servedRelease: '2026-10-29+debian' })
    const { ctx, res } = context({ name: 'tar', section: '1' })
    const result = await pageProps(ctx)
    expect(propsOf(result)).toMatchObject({ head: { noindex: true } })
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
    lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: '2026-10-28+debian' })
    const { ctx, res } = context({ name: 'ta', section: '9' })
    const result = await pageProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(res.headers['cdn-cache-control']).toBe('public, s-maxage=600, stale-while-revalidate=3600')
    const html = renderToStaticMarkup(ManPageRoute(propsOf(result) as Parameters<typeof ManPageRoute>[0]))
    expect(html).toContain('No manual entry for ta in section 9')
    expect(html).not.toContain('data-bm-manual')
    const { head } = propsOf(result) as { head: ManHeadData }
    expect(renderToStaticMarkup(<ManHeadTags {...head} />)).toContain('<meta name="robots" content="noindex"/>')

    lookup.manMiss.mockImplementation(async (opts: object) => ({ ...opts, suggestions: [], distros: [], limited: true, answeredByKey: true }))
    const limited = context({ name: 'ta', section: '9' })
    await pageProps(limited.ctx)
    expect(limited.res.headers['cache-control']).toBe('private, no-store')
    expect(limited.res.headers['cdn-cache-control']).toBeUndefined()
  })

  it('redirects a .so alias, permanently only for an explicit distro', async () => {
    lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'gzip', section: '1', distro: 'debian', servedRelease: '2026-10-28+debian' })
    await expect(pageProps(context({ name: 'gunzip', section: '1' }).ctx)).resolves.toEqual({ redirect: { destination: '/man/gzip/1', permanent: false } })
    await expect(pageProps(context({ name: 'gunzip', section: '1' }, { distro: 'debian' }).ctx)).resolves.toEqual({
      redirect: { destination: '/man/gzip/1?distro=debian', permanent: true },
    })
    lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'foo::bar', section: '3pm', pkg: 'alternate-perl', distro: 'debian', servedRelease: '2026-10-28+debian' })
    await expect(pageProps(context({ name: 'foo::stub', section: '3pm' }).ctx)).resolves.toEqual({
      redirect: { destination: '/man/foo%3A%3Abar/3pm?pkg=alternate-perl', permanent: false },
    })
  })
})

describe('answers from another release than the proxy key', () => {
  const other = '2026-10-29+debian'
  it('shares no redirect, alias or miss that release B gave under release A', async () => {
    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'race-probe', section: '9' }, servedRelease: other })
    const name = context({ name: 'race-probe' })
    await expect(nameProps(name.ctx)).resolves.toMatchObject({ redirect: { destination: '/man/race-probe/9' } })
    expect(name.res.headers['cache-control']).toBe('private, no-store')

    lookup.lookupManPage.mockResolvedValue({ kind: 'alias', name: 'bzip2', section: '1', distro: 'debian', servedRelease: other })
    const alias = context({ name: 'race-alias', section: '1' })
    await pageProps(alias.ctx)
    expect(alias.res.headers['cache-control']).toBe('private, no-store')

    lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: other })
    const miss = context({ name: 'race-probe', section: '1' })
    await pageProps(miss.ctx)
    expect(miss.res.statusCode).toBe(404)
    expect(miss.res.headers['cache-control']).toBe('private, no-store')
    expect(miss.res.headers['cdn-cache-control']).toBeUndefined()

    // A miss whose suggestions or distros came from B is not shared either.
    lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: '2026-10-28+debian' })
    lookup.manMiss.mockImplementation(async (opts: object) => ({ ...opts, suggestions: [{ name: 'b-page', section: '1', description: '' }], distros: [], limited: false, answeredByKey: false }))
    const crossed = context({ name: 'rcr-link', section: '1' })
    await pageProps(crossed.ctx)
    expect(crossed.res.headers['cache-control']).toBe('private, no-store')
    const crossedName = context({ name: 'rcr-link' })
    lookup.resolveManName.mockResolvedValue({ result: null, servedRelease: '2026-10-28+debian' })
    await nameProps(crossedName.ctx)
    expect(crossedName.res.headers['cache-control']).toBe('private, no-store')

    lookup.resolveManName.mockResolvedValue({ result: null, servedRelease: null })
    const unknown = context({ name: 'gizp' })
    await nameProps(unknown.ctx)
    expect(unknown.res.headers['cache-control']).toBe('private, no-store')
  })
})

describe('/man/<name>', () => {
  it.each([undefined, true, false])('renders picker robots from the existing name resolution (%s)', async indexable => {
    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'ambiguous', indexable, options: [{ section: '3', description: 'library' }, { section: '3pm', description: 'module' }] }, servedRelease: release.datasetReleaseId })
    const result = await nameProps(context({ name: 'library' }).ctx)
    const { head } = propsOf(result) as { head: ManHeadData }
    expect(renderToStaticMarkup(<ManHeadTags {...head} />).includes('<meta name="robots" content="noindex"/>')).toBe(indexable === false)
    expect(head.canonical === null).toBe(indexable === false)
    expect(lookup.resolveManName).toHaveBeenCalledTimes(1)
    expect(lookup.lookupManPage).not.toHaveBeenCalled()
  })

  it('redirects to the only section and renders a picker for several', async () => {
    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: '2026-10-28+debian' })
    await expect(nameProps(context({ name: 'tar' }, { distro: 'ubuntu' }).ctx)).resolves.toEqual({ redirect: { destination: '/man/tar/1?distro=ubuntu', permanent: false } })

    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'ambiguous', options: [{ section: '1', description: 'format' }, { section: '3', description: 'formatted output' }] }, servedRelease: '2026-10-28+debian' })
    const result = await nameProps(context({ name: 'printf' }).ctx)
    const html = renderToStaticMarkup(ManNameRoute(propsOf(result) as Parameters<typeof ManNameRoute>[0]))
    expect(html).toContain('href="/man/printf/1"')
    expect(html).toContain('href="/man/printf/3"')
  })

  it('keeps a requested package private until the page it leads to proves it', async () => {
    lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: '2026-10-28+debian' })
    const withPkg = context({ name: 'tar' }, { pkg: 'made-up' })
    await expect(nameProps(withPkg.ctx)).resolves.toEqual({ redirect: { destination: '/man/tar/1?pkg=made-up', permanent: false } })
    expect(withPkg.res.headers['cache-control']).toBe('private, no-store')
    const bare = context({ name: 'tar' })
    await nameProps(bare.ctx)
    expect(bare.res.headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
  })

    it('answers a missing name with a 404', async () => {
    lookup.resolveManName.mockResolvedValue({ result: null, servedRelease: '2026-10-28+debian' })
    const { ctx, res } = context({ name: 'gizp' })
    await nameProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(lookup.manMiss).toHaveBeenCalledWith(expect.objectContaining({ name: 'gizp', section: null, distro: 'debian', urlDistro: null }))
  })
})


it('renders package choices without canonical declarations for noindex pages', async () => {
  const providers = { packages: ['alternate', 'tar'], defaultPackage: 'tar', policy: 'debian' }
  for (const [pkg, expected] of [['alternate', '?distro=ubuntu&pkg=alternate'], ['tar', '?distro=ubuntu']]) {
    lookup.lookupManPage.mockResolvedValue({ kind: 'page', distro: 'ubuntu', data: { ...data, providers, page: { ...page, sourcePackage: pkg, indexable: false } }, related: [], servedRelease: release.datasetReleaseId })
    const { ctx, res } = context({ name: 'tar', section: '1' }, { distro: 'ubuntu', pkg })
    const result = await pageProps(ctx)
    expect(propsOf(result)).toMatchObject({ head: { canonical: null, noindex: true, ogImage: { url: `http://localhost:3000/man/tar/1/og${expected}` } } })
    expect(res.headers['cdn-cache-control']).toContain('public')
    const html = renderToStaticMarkup(ManPageRoute(propsOf(result) as Parameters<typeof ManPageRoute>[0]))
    expect(html).toContain('Provided by')
    expect(html).toContain('BetterMan’s default for this release.')
    expect(html).toContain('aria-current="page"')
  }
})


it('preserves an explicit package in the name-only redirect and section picker', async () => {
  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'page', name: 'tar', section: '1' }, servedRelease: release.datasetReleaseId })
  await expect(nameProps(context({ name: 'tar' }, { pkg: 'alternate' }).ctx)).resolves.toMatchObject({ redirect: { destination: '/man/tar/1?pkg=alternate' } })
  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'ambiguous', options: [{ section: '1', description: 'archive' }] }, servedRelease: release.datasetReleaseId })
  const result = await nameProps(context({ name: 'tar' }, { pkg: 'alternate', distro: 'ubuntu' }).ctx)
  const html = renderToStaticMarkup(ManNameRoute(propsOf(result) as Parameters<typeof ManNameRoute>[0]))
  expect(html).toContain('href="/man/tar/1?distro=ubuntu&amp;pkg=alternate"')
})


it('keeps an alias target package ahead of an explicit name-route selector', async () => {
  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'alias', name: 'tnftp', section: '1', pkg: 'tnftp' }, servedRelease: release.datasetReleaseId })
  await expect(nameProps(context({ name: 'ftp' }, { pkg: 'ftp.app' }).ctx)).resolves.toMatchObject({ redirect: { destination: '/man/tnftp/1?pkg=tnftp' } })
  lookup.resolveManName.mockResolvedValue({ distro: 'debian', result: { kind: 'alias', name: 'tnftp', section: '1' }, servedRelease: release.datasetReleaseId })
  await expect(nameProps(context({ name: 'ftp' }, { pkg: 'ftp.app' }).ctx)).resolves.toMatchObject({ redirect: { destination: '/man/tnftp/1' } })
})

it('keeps repeated explicit misses private without a page-limit mutation or typo reads', async () => {
  lookup.lookupManPage.mockResolvedValue({ kind: 'miss', servedRelease: release.datasetReleaseId })
  for (const pkg of ['invented-one', 'invented-two', 'invented-three']) {
    const { ctx, res } = context({ name: 'tar', section: '1' }, { pkg })
    await pageProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(res.headers['cache-control']).toBe('private, no-store')
  }
  expect(limiter.isRateLimited).not.toHaveBeenCalled()
  expect(lookup.manMiss).not.toHaveBeenCalled()
})
