import { createHash, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// This test changes active releases; run only against a dedicated local seed.
test('text cache keys survive promotion and rollback on local Convex', async ({ request, baseURL }) => {
  const site = process.env.TEXT_RACE_SITE_URL
  test.skip(!site, 'Requires a dedicated local Convex backend')
  expect(baseURL).toBeTruthy()
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
  const url = new URL(site!)
  expect(['localhost', '127.0.0.1']).toContain(url.hostname)
  test.setTimeout(120_000)
  const secret = process.env.CONVEX_INGEST_SECRET!
  expect(secret).toBeTruthy()
  const contract = await (await request.get(`${url.origin}/ingest/contract`, { headers: { Authorization: `Bearer ${secret}` } })).json()
  const post = async (path: string, body: object) => {
    const res = await request.post(`${url.origin}${path}`, { headers: { Authorization: `Bearer ${secret}`, 'X-BetterMan-Ingest-Contract': String(contract.schemaVersion) }, data: body })
    expect([200, 409], `${path}: ${await res.text()}`).toContain(res.status())
    return await res.json()
  }
  const now = new Date().toISOString()
  const suffix = randomUUID()
  const a = `text-race-a-${suffix}`
  const b = `text-race-b-${suffix}`
  const activate = async (datasetReleaseId: string) => {
    for (let i = 0; i < 300; i++) {
      const result = await post('/ingest/activate', { stage: 'prod', datasetReleaseId, activatedAt: now })
      if (result.pending === false) return
      expect(result.pending).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error('Local release activation timed out')
  }
  const seed = async (id: string, version: 'A' | 'B') => {
    const names = version === 'A' ? ['racepage', 'targeta'] : ['racepage', 'targetb', 'racemissing']
    const pages = names.map(name => {
      const doc = { toc: [], blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text: `release ${version} ${name}` }] }] }
      return { externalId: randomUUID(), name, section: '1', sitemapPage: 0, title: `${name}(1)`, description: name, sourcePath: `/test/${name}.1`, sourcePackage: null, sourcePackageVersion: null, contentSha256: createHash('sha256').update(JSON.stringify(doc)).digest('hex'), hasParseWarnings: false, doc, synopsis: null, options: null, seeAlso: null, searchText: name, snippetText: name, links: [] }
    })
    await post('/ingest/release', { datasetReleaseId: id, locale: 'en', distro: 'debian', imageRef: 'test', imageDigest: 'test', ingestedAt: now, packageManifest: { packages: [] }, pageCount: pages.length, providerCount: 0, packageBatches: [], aliasCount: 1, licenseCount: 0, sectionTotals: [{ section: '1', total: pages.length }], licensePackages: [] })
    await post('/ingest/pages', { datasetReleaseId: id, pages })
    await post('/ingest/aliases', { datasetReleaseId: id, aliases: [{ name: 'racealias', section: '1', targetName: version === 'A' ? 'targeta' : 'targetb', targetSection: '1' }] })
    await activate(id)
  }
  await seed(a, 'A')
  // Warm the proxy's A key without caching the test lookups.
  expect((await request.get('/man/racewarm/1.txt')).status()).toBe(404)
  await seed(b, 'B')
  const bPage = await request.get('/man/racepage/1.txt')
  expect(await bPage.text()).toContain('release B racepage')
  expect(bPage.headers()['cache-control']).toBe('private, no-store')
  for (const path of ['/man/racealias/1.txt', '/racealias.txt']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.headers().location).toBe('/man/targetb/1.txt')
    expect(res.headers()['cache-control']).toBe('private, no-store')
  }
  const bMissing = await request.get('/man/racemissing/1.txt')
  expect(bMissing.status()).toBe(200)
  expect(bMissing.headers()['cache-control']).toBe('private, no-store')
  await activate(a)
  const page = await request.get('/man/racepage/1.txt')
  expect(await page.text()).toContain('release A racepage')
  expect(page.headers()['cache-control']).toContain('public')
  for (const path of ['/man/racealias/1.txt', '/racealias.txt']) {
    expect((await request.get(path, { maxRedirects: 0 })).headers().location).toBe('/man/targeta/1.txt')
  }
  expect((await request.get('/man/racemissing/1.txt')).status()).toBe(404)
})
