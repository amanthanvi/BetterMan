import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForRelatedMetadata } from './check-related-metadata.mjs'

function clock() {
  let time = 0
  return { timeoutMs: 20, intervalMs: 5, now: () => time, pause: async (ms) => { time += ms }, log: () => {} }
}
const completed = { complete: true, releases: [{ complete: true }] }
const pending = { complete: false, releases: [{ complete: false }] }

test('accepts completed active releases without waiting', async () => {
  assert.equal(await waitForRelatedMetadata(async () => completed, clock()), completed)
})

test('waits for the current status rather than accepting scheduling', async () => {
  let calls = 0
  const result = await waitForRelatedMetadata(async () => ++calls === 3 ? completed : pending, clock())
  assert.equal(result, completed)
  assert.equal(calls, 3)
})

test('fails closed for missing releases and a bounded timeout', async () => {
  let calls = 0
  await assert.rejects(waitForRelatedMetadata(async () => { calls++; return pending }, clock()), /deadline/)
  assert.equal(calls, 4)
})

test('does not accept empty or inconsistent completion claims', async () => {
  for (const status of [{ complete: true, releases: [] }, { complete: true, releases: [{ complete: false }] }]) {
    await assert.rejects(waitForRelatedMetadata(async () => status, clock()), /deadline/)
  }
})

test('rejects malformed or unbounded provider output', async () => {
  for (const status of [null, {}, { complete: true, releases: Array(15).fill({ complete: true }) }]) {
    await assert.rejects(waitForRelatedMetadata(async () => status, clock()), /Invalid/)
  }
})

test('propagates query failures instead of treating them as completion', async () => {
  await assert.rejects(waitForRelatedMetadata(async () => { throw new Error('unavailable') }, clock()), /unavailable/)
})
