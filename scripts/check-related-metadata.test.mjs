import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForRelatedMetadata } from './check-related-metadata.mjs'

function clock() {
  let time = 0
  return { timeoutMs: 20, intervalMs: 5, now: () => time, pause: async (ms) => { time += ms }, log: () => {} }
}
const completed = {
  complete: true,
  releases: ['staging', 'prod'].flatMap((stage) => ['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'].map((distro) => ({
    datasetReleaseId: `release-${distro}`, stage, distro,
    complete: true, manifestVerified: true, manifestError: null, sealed: true, currentVersion: 0, completedVersion: 0,
  }))),
}
const pending = { complete: false, releases: completed.releases.map((release) => ({ ...release, complete: false, completedVersion: null })) }
const changedFirst = (change) => ({ complete: true, releases: [{ ...completed.releases[0], ...change }, ...completed.releases.slice(1)] })

test('accepts completed active releases without waiting', async () => {
  assert.equal(await waitForRelatedMetadata(async () => completed, clock()), completed)
})

test('waits for the current status rather than accepting scheduling', async () => {
  let calls = 0
  const result = await waitForRelatedMetadata(async () => ++calls === 3 ? completed : pending, clock())
  assert.equal(result, completed)
  assert.equal(calls, 3)
})

test('fails closed when hydration exceeds the bounded timeout', async () => {
  let calls = 0
  await assert.rejects(waitForRelatedMetadata(async () => { calls++; return pending }, clock()), /deadline/)
  assert.equal(calls, 4)
})

test('does not accept inconsistent completion claims', async () => {
  await assert.rejects(waitForRelatedMetadata(async () => changedFirst({ complete: false }), clock()), /deadline/)
})

test('rejects malformed or unbounded provider output', async () => {
  for (const status of [null, {}, { complete: true, releases: Array(15).fill({ complete: true }) }]) {
    await assert.rejects(waitForRelatedMetadata(async () => status, clock()), /Invalid/)
  }
})

test('propagates query failures instead of treating them as completion', async () => {
  await assert.rejects(waitForRelatedMetadata(async () => { throw new Error('unavailable') }, clock()), /unavailable/)
})

test('rejects unsealed or inconsistent versions even when complete is claimed', async () => {
  for (const change of [{ sealed: false }, { sealed: undefined }, { currentVersion: 1 }, { currentVersion: -1 }, { currentVersion: null }]) {
    const status = changedFirst(change)
    await assert.rejects(waitForRelatedMetadata(async () => status, clock()), /deadline/)
  }
})

test('rejects unknown legacy or incomplete upload manifests despite completed hydration', async () => {
  for (const manifestVerified of [undefined, false, null, 'true']) {
    const status = changedFirst({ manifestVerified })
    await assert.rejects(waitForRelatedMetadata(async () => status, clock()), /deadline/)
  }
})

test('requires all fourteen production and staging pointers without waiting for missing pairs', async () => {
  for (const releases of [[], completed.releases.slice(0, 1), completed.releases.slice(0, 13)]) {
    let reads = 0
    let pauses = 0
    await assert.rejects(waitForRelatedMetadata(async () => {
      reads++
      return { complete: true, releases }
    }, { ...clock(), pause: async () => { pauses++; throw new Error('unexpected wait') } }), /Missing active release pointers:.*prod\/macos/)
    assert.equal(reads, 1)
    assert.equal(pauses, 0)
  }
})

test('rejects duplicate, unsupported, and malformed stage/distribution pairs', async () => {
  const duplicate = { complete: true, releases: [completed.releases[1], ...completed.releases.slice(1)] }
  await assert.rejects(waitForRelatedMetadata(async () => duplicate, clock()), /Duplicate.*staging\/ubuntu/)
  for (const change of [{ stage: 'preview' }, { distro: 'centos' }, { stage: null }, { distro: undefined }, { stage: ['staging'] }]) {
    await assert.rejects(waitForRelatedMetadata(async () => changedFirst(change), clock()), /Invalid.*pair/)
  }
  await assert.rejects(waitForRelatedMetadata(async () => ({ ...completed, releases: [null, ...completed.releases.slice(1)] }), clock()), /Invalid.*pair/)
})

test('accepts all expected pairs in any order and allows both stages to share a release', async () => {
  const status = { complete: true, releases: completed.releases.toReversed() }
  assert.equal(await waitForRelatedMetadata(async () => status, clock()), status)
})

test('stops immediately with manifest error evidence even when overall completion is claimed', async () => {
  for (const manifestError of ['LEGACY_ALIAS_COUNT_UNDECLARED', 'RELEASE_MANIFEST_INCOMPLETE']) {
    let reads = 0
    let pauses = 0
    const status = changedFirst({ manifestError })
    await assert.rejects(waitForRelatedMetadata(async () => {
      reads++
      return status
    }, { ...clock(), pause: async () => { pauses++; throw new Error('unexpected wait') } }),
    new RegExp(`Manifest verification failed for staging/debian: ${manifestError}`))
    assert.equal(reads, 1)
    assert.equal(pauses, 0)
  }
})

test('rejects malformed manifest errors instead of accepting a completion claim', async () => {
  for (const manifestError of [undefined, false, {}, '', '   ']) {
    await assert.rejects(waitForRelatedMetadata(async () => changedFirst({ manifestError }), clock()), /Invalid.*manifest error/)
  }
})
