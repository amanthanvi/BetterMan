import assert from 'node:assert/strict'
import test from 'node:test'
import { checkDerivedStatus } from './check-derived-data.mjs'
test('fails visibly for pending, blocked, failed, skipped, and crashed derived work', () => {
  for (const state of ['uninitialized', 'blocked', 'failed', 'summaries']) assert.throws(() => checkDerivedStatus({ state, healthy: false }), /not healthy/)
  assert.throws(() => checkDerivedStatus({ state: 'complete', healthy: true, skipped: 1 }), /not healthy/)
  assert.throws(() => checkDerivedStatus({ state: 'complete', healthy: true, error: 'SCHEDULED_BATCH_FAILED' }), /not healthy/)
  assert.throws(() => checkDerivedStatus({}), /Invalid/)
})
test('reports bounded operational fields without arbitrary input fields', () => {
  const result = checkDerivedStatus({ state: 'complete', healthy: true, skipped: 0, scanned: 24000, private: 'must not print' })
  assert.deepEqual(result, { state: 'complete', healthy: true, scanned: 24000, skipped: 0 })
})
