import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detachLegacyManifests } from './detach-legacy-manifests.mjs'

test('manifest migration defaults to dry-run and walks every bounded cursor', async () => {
  const calls = []
  const run = async (name, args) => { calls.push([name, args]); return { moved: 2, isDone: args.cursor !== null, continueCursor: 'next' } }
  assert.deepEqual(await detachLegacyManifests(run), { apply: false, eligible: 4, batches: 2 })
  assert.deepEqual(calls.map(([, args]) => args), [{ cursor: null, dryRun: true }, { cursor: 'next', dryRun: true }])
  calls.length = 0
  await detachLegacyManifests(run, { apply: true })
  assert.ok(calls.every(([name, args]) => name === 'maintenance:detachLegacyManifests' && args.dryRun === false))
})
test('manifest migration fails on errors, malformed responses and stalled cursors', async () => {
  await assert.rejects(detachLegacyManifests(async () => { throw new Error('conflict') }), /conflict/)
  await assert.rejects(detachLegacyManifests(async () => ({})), /Invalid/)
  await assert.rejects(detachLegacyManifests(async () => ({ moved: 1, isDone: false, continueCursor: 'same' })), /advance/)
})
