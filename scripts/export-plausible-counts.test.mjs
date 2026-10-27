import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { exportPlausibleCounts } from './export-plausible-counts.mjs'

const now = new Date('2026-10-26T16:42:00Z')
const key = 'mock-secret-never-log'
const row = (path, count) => ({ dimensions: [path], metrics: [count] })
const response = (results) => ({ ok: true, json: async () => ({ results }) })

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'betterman-counts-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'counts.json')
  await writeFile(output, 'prior snapshot\n')
  return {
    directory, output,
    options: { env: { PLAUSIBLE_API_KEY: key, PLAUSIBLE_SITE_ID: 'example.test', PLAUSIBLE_COUNTS_OUTPUT: output }, now },
  }
}

test('no key is a network-free no-op that preserves the prior snapshot', async (t) => {
  const { output, options } = await fixture(t)
  for (const missingKey of [undefined, '', '  ']) {
    assert.equal(await exportPlausibleCounts({
      ...options,
      env: { PLAUSIBLE_API_KEY: missingKey, PLAUSIBLE_COUNTS_OUTPUT: output },
      fetchImpl: () => assert.fail('must not fetch'),
    }), null)
  }
  assert.equal(await readFile(output, 'utf8'), 'prior snapshot\n')
})

test('requires a site only when a key is supplied, without fetching', async () => {
  await assert.rejects(exportPlausibleCounts({
    env: { PLAUSIBLE_API_KEY: key }, fetchImpl: () => assert.fail('must not fetch'),
  }), /PLAUSIBLE_SITE_ID or NEXT_PUBLIC_PLAUSIBLE_DOMAIN is required/)
})

test('exports the complete corpus beyond 10,000 pages using v2 POST pagination', async (t) => {
  const { output, directory, options } = await fixture(t)
  const requests = []
  const first = Array.from({ length: 10_000 }, (_, i) => row(`/man/${String(i).padStart(5, '0')}`, i))
  const snapshot = await exportPlausibleCounts({
    ...options,
    fetchImpl: async (url, init) => {
      requests.push(JSON.parse(init.body))
      assert.equal(url, 'https://plausible.io/api/v2/query')
      assert.equal(init.method, 'POST')
      assert.deepEqual(init.headers, { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })
      assert.ok(init.signal instanceof AbortSignal)
      assert.equal(init.redirect, 'error')
      // The old file remains intact even after a full response has arrived.
      assert.equal(await readFile(output, 'utf8'), 'prior snapshot\n')
      return response(requests.length === 1 ? first : [row('/man/10000', 42)])
    },
  })
  assert.deepEqual(requests.map((request) => request.pagination), [
    { limit: 10_000, offset: 0 }, { limit: 10_000, offset: 10_000 },
  ])
  for (const request of requests) {
    assert.deepEqual({ ...request, pagination: undefined }, {
      site_id: 'example.test', metrics: ['pageviews'], dimensions: ['event:page'],
      date_range: ['2026-09-26T00:00:00.000Z', '2026-10-25T23:59:59.999Z'],
      order_by: [['event:page', 'asc']], pagination: undefined,
    })
  }
  assert.equal(Object.keys(snapshot.pageviews).length, 10_001)
  assert.equal(snapshot.pageviews['/man/00000'], 0)
  assert.equal(snapshot.pageviews['/man/10000'], 42)
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), {
    schemaVersion: 1, siteId: 'example.test', generatedAt: now.toISOString(),
    dateRange: requests[0].date_range, pageviews: { ...snapshot.pageviews },
  })
  assert.deepEqual(await readdir(directory), ['counts.json'])
})

test('uses the public domain fallback and writes a valid empty snapshot', async (t) => {
  const { output, options } = await fixture(t)
  const snapshot = await exportPlausibleCounts({
    ...options,
    env: { ...options.env, PLAUSIBLE_SITE_ID: ' ', NEXT_PUBLIC_PLAUSIBLE_DOMAIN: ' fallback.test ' },
    now: new Date('2026-03-01T00:01:00Z'),
    fetchImpl: async (_, init) => {
      assert.equal(JSON.parse(init.body).site_id, 'fallback.test')
      return response([])
    },
  })
  assert.equal(snapshot.siteId, 'fallback.test')
  assert.deepEqual(snapshot.dateRange, ['2026-01-30T00:00:00.000Z', '2026-02-28T23:59:59.999Z'])
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).pageviews, {})
})

test('rejects malformed provider results and never replaces a prior snapshot', async (t) => {
  const { output, directory, options } = await fixture(t)
  const malformed = [
    null, {}, { results: null }, { results: {} }, { results: Array(10_001).fill(row('/', 1)) },
    ...[
      null, {}, { dimensions: '/', metrics: [1] }, { dimensions: ['/'], metrics: 1 },
      row('', 1), row('not-a-path', 1), row(null, 1), row('/', -1), row('/', 1.5),
      row('/', '1'), row('/', null), row('/', NaN), row('/', Infinity), row('/', 2 ** 53),
      { dimensions: ['/', '/other'], metrics: [1] }, { dimensions: ['/'], metrics: [] },
      { dimensions: ['/'], metrics: [1, 2] },
    ].map((badRow) => ({ results: [row('/valid', 2), badRow] })),
    { results: [row('/duplicate', 1), row('/duplicate', 2)] },
  ]
  for (const data of malformed) {
    await assert.rejects(exportPlausibleCounts({
      ...options, fetchImpl: async () => ({ ok: true, json: async () => data }),
    }), /Invalid Plausible|Duplicate Plausible/)
    assert.equal(await readFile(output, 'utf8'), 'prior snapshot\n')
  }
  assert.deepEqual(await readdir(directory), ['counts.json'])
})

test('HTTP, network and JSON errors never expose credentials or provider bodies', async (t) => {
  const { output, options } = await fixture(t)
  const sensitive = `${key}: private provider body`
  const failures = [
    async () => { throw new Error(sensitive) },
    async () => ({ ok: false, status: 401, statusText: sensitive, json: () => assert.fail('must not read error body') }),
    async () => ({ ok: true, json: async () => { throw new Error(sensitive) } }),
  ]
  for (const fetchImpl of failures) {
    await assert.rejects(exportPlausibleCounts({ ...options, fetchImpl }), (error) => {
      assert.match(error.message, /Plausible/)
      assert.ok(!String(error.stack).includes(key))
      assert.ok(!String(error.stack).includes('private provider body'))
      assert.equal(error.cause, undefined)
      return true
    })
    assert.equal(await readFile(output, 'utf8'), 'prior snapshot\n')
  }
})

test('requires the next page after an exact 10,000-row response and preserves output on failure', async (t) => {
  const { output, options } = await fixture(t)
  const full = Array.from({ length: 10_000 }, (_, i) => row(`/page/${i}`, 1))
  for (const next of [response([]), response([row('/page/0', 1)]), { ok: false }]) {
    let calls = 0
    const run = () => exportPlausibleCounts({
      ...options, fetchImpl: async () => ++calls === 1 ? response(full) : next,
    })
    if (next.ok && (await next.json()).results.length === 0) {
      assert.equal(Object.keys((await run()).pageviews).length, 10_000)
    } else {
      await writeFile(output, 'prior snapshot\n')
      await assert.rejects(run(), /Duplicate Plausible|HTTP failure/)
      assert.equal(await readFile(output, 'utf8'), 'prior snapshot\n')
    }
    assert.equal(calls, 2)
  }
})

test('cleans the temporary file when atomic replacement fails', async (t) => {
  const { directory, options } = await fixture(t)
  const target = join(directory, 'existing-directory')
  await mkdir(target)
  await writeFile(join(target, 'keep'), 'retained')
  await assert.rejects(exportPlausibleCounts({
    ...options, env: { ...options.env, PLAUSIBLE_COUNTS_OUTPUT: target }, fetchImpl: async () => response([row('/', 1)]),
  }))
  assert.equal(await readFile(join(target, 'keep'), 'utf8'), 'retained')
  assert.deepEqual((await readdir(directory)).sort(), ['counts.json', 'existing-directory'])
})
