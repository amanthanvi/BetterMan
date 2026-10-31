import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRanking } from './check-convex-production.mjs'

test('production ranking advisories cannot fail deploy/promotion on an unscored corpus', async () => {
  const client = { query: async () => ({ results: [{ name: 'dpkg', section: '1' }] }) }
  const report = await checkRanking(client, 'debian')
  assert.deepEqual(report.failures, [])
  assert.equal(report.warnings.length, 5)
  assert.equal((await checkRanking(client, 'debian', true)).failures.length, 5)
})

test('production accepts tar in the top three; the seed must put it first', async () => {
  const client = { query: async () => ({ results: [{ name: 'dpkg', section: '1' }, { name: 'tar', section: '1' }] }) }
  assert.deepEqual(await checkRanking(client, 'debian'), { failures: [], warnings: [] })
  assert.equal((await checkRanking(client, 'debian', true)).failures.length, 5)
  assert.deepEqual(await checkRanking({ query: async () => ({ results: [{ name: 'tar', section: '1' }] }) }, 'debian', true), { failures: [], warnings: [] })
})

test('ranking query errors are advisory only in production mode', async () => {
  const client = { query: async () => { throw new Error('unavailable') } }
  assert.equal((await checkRanking(client, 'debian')).warnings.length, 5)
  assert.equal((await checkRanking(client, 'debian', true)).failures.length, 5)
})
