import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  cleanupOrphanBlobs, listInactiveReleases, mapWithConcurrency, parseOptions, prune, pruneRelease, selectPrunable,
} from './prune-inactive-releases.mjs'

const now = Date.parse('2026-09-14T18:00:00Z')
const day = 24 * 60 * 60 * 1000
const policy = { keepPerDistro: 1, minAgeMs: day, now }
const release = (overrides) => ({
  datasetReleaseId: `r-${overrides.ingestedAt}-${overrides.distro ?? 'debian'}`, locale: 'en', distro: 'debian',
  sealed: true, pruning: false, manifestBasis: 'declared', manifestVerified: true, manifestError: null, ...overrides,
})
const at = (daysAgo) => new Date(now - daysAgo * day).toISOString()

test('parses environment options with safe defaults and rejects malformed counts', () => {
  assert.deepEqual(parseOptions({}, now), { apply: false, keepPerDistro: 1, minAgeMs: day, concurrency: 4, now })
  assert.equal(parseOptions({ BETTERMAN_PRUNE_APPLY: 'true', BETTERMAN_PRUNE_KEEP_PER_DISTRO: '2' }, now).keepPerDistro, 2)
  assert.equal(parseOptions({ BETTERMAN_PRUNE_APPLY: 'yes' }, now).apply, false)
  for (const bad of ['-1', '1.5', 'abc', '1e3']) {
    assert.throws(() => parseOptions({ BETTERMAN_PRUNE_KEEP_PER_DISTRO: bad }, now), /non-negative integer/)
  }
})

test('never selects unsealed or recent releases and always finishes started prunes', () => {
  const { prune: selected, skipped } = selectPrunable([
    release({ ingestedAt: at(3), sealed: false, manifestVerified: false }),
    release({ ingestedAt: at(0.5), datasetReleaseId: 'fresh' }),
    release({ ingestedAt: at(0.1), datasetReleaseId: 'started', pruning: true, sealed: false }),
  ], policy)
  assert.deepEqual(selected.map((r) => [r.datasetReleaseId, r.reason]), [['started', 'pruning already started']])
  assert.deepEqual(skipped.map((r) => r.reason), ['younger than the minimum age', 'unsealed upload in progress'])
})

test('retains the newest verified release per distro and prunes older or unverifiable ones', () => {
  const inactive = [
    release({ ingestedAt: at(13), datasetReleaseId: 'legacy-debian', manifestBasis: 'legacy_unverified_aliases', manifestVerified: false, manifestError: 'LEGACY_ALIAS_EXPECTATION_UNKNOWN' }),
    release({ ingestedAt: at(11), datasetReleaseId: 'legacy-debian-2', manifestBasis: null, manifestVerified: false }),
    release({ ingestedAt: at(5), datasetReleaseId: 'verified-old-debian' }),
    release({ ingestedAt: at(2), datasetReleaseId: 'verified-new-debian' }),
    release({ ingestedAt: at(2), datasetReleaseId: 'verified-arch', distro: 'arch' }),
    release({ ingestedAt: at(4), datasetReleaseId: 'failed-arch', distro: 'arch', manifestVerified: false, manifestError: 'RELEASE_MANIFEST_INCOMPLETE' }),
  ]
  const result = selectPrunable(inactive, policy)
  assert.deepEqual(result.retained.map((r) => r.datasetReleaseId).sort(), ['verified-arch', 'verified-new-debian'])
  assert.deepEqual(result.prune.map((r) => r.datasetReleaseId).sort(), ['failed-arch', 'legacy-debian', 'legacy-debian-2', 'verified-old-debian'])
  assert.match(result.prune.find((r) => r.datasetReleaseId === 'legacy-debian').reason, /LEGACY_ALIAS_EXPECTATION_UNKNOWN/)
  assert.match(result.prune.find((r) => r.datasetReleaseId === 'verified-old-debian').reason, /beyond retention/)
  assert.equal(selectPrunable(inactive, { ...policy, keepPerDistro: 0 }).retained.length, 0)
  assert.equal(selectPrunable(inactive, { ...policy, keepPerDistro: 5 }).prune.length, 3)
})

test('rejects malformed preview entries instead of guessing', () => {
  assert.throws(() => selectPrunable([{ sealed: true }], policy), /Invalid inactive release/)
  assert.throws(() => selectPrunable([release({ ingestedAt: at(3), datasetReleaseId: '  ' })], policy), /Invalid inactive release/)
  assert.deepEqual(selectPrunable([release({ ingestedAt: 'not a date', datasetReleaseId: 'x' })], policy).skipped.map((r) => r.reason), ['younger than the minimum age'])
})

test('pages through every inactive release and rejects duplicates or missing cursors', async () => {
  const calls = []
  const pages = [
    { inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: 'c1' },
    { inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'b' })], isDone: true, continueCursor: null },
  ]
  const run = async (name, args) => { calls.push([name, args]); return pages.shift() }
  const result = await listInactiveReleases(run)
  assert.deepEqual(result.map((r) => r.datasetReleaseId), ['a', 'b'])
  assert.deepEqual(calls.map(([, args]) => args.cursor), [null, 'c1'])
  assert.ok(calls.every(([name, args]) => name === 'maintenance:previewInactiveReleases' && args.limit === 10))

  await assert.rejects(listInactiveReleases(async () => ({ inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: null })), /continuation cursor/)
  await assert.rejects(listInactiveReleases(async () => ({ inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: 'same' })), /Duplicate release/)
  await assert.rejects(listInactiveReleases(async () => ({})), /Invalid inactive release preview response/)
})

test('deletes one release in bounded confirmed batches until the release row is gone', async () => {
  const calls = []
  const responses = [
    { datasetReleaseId: 'r', deleted: 200, deletedByTable: { manPages: 150, manPageLinks: 50 }, deletedRelease: false, hasMore: true },
    { datasetReleaseId: 'r', deleted: 3, deletedByTable: { manPages: 2, datasetReleases: 1 }, deletedRelease: true, hasMore: false },
  ]
  const run = async (name, args) => { calls.push([name, args]); return responses.shift() }
  const result = await pruneRelease(run, 'r', { log: () => {} })
  assert.deepEqual(result, { datasetReleaseId: 'r', batches: 2, deleted: 203, deletedByTable: { manPages: 152, manPageLinks: 50, datasetReleases: 1 } })
  assert.deepEqual(calls[0], ['maintenance:deleteInactiveReleaseBatch', { datasetReleaseId: 'r', confirmDatasetReleaseId: 'r', maxDocs: 200 }])
})

test('stops on stalled, mismatched, or failing deletions', async () => {
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'r', deleted: 0, deletedByTable: {}, deletedRelease: false, hasMore: true }), 'r', { log: () => {} }), /no progress/)
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'r', deleted: 5, deletedByTable: {}, deletedRelease: false, hasMore: false }), 'r', { log: () => {} }), /stalled/)
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'other', deleted: 5, deletedByTable: {}, deletedRelease: true, hasMore: false }), 'r', { log: () => {} }), /Invalid deletion response/)
  await assert.rejects(pruneRelease(async () => { throw new Error('REFUSING_TO_DELETE_ACTIVE_RELEASE') }, 'r', { log: () => {} }), /REFUSING_TO_DELETE_ACTIVE_RELEASE/)
})

test('sweeps orphan blobs across every page and honours dry run', async () => {
  const calls = []
  const pages = [
    { isDone: false, continueCursor: 'n', scanned: 100, orphans: 2, blobDeletes: 0, chunkDeletes: 0, oversizedSkipped: 0 },
    { isDone: true, continueCursor: null, scanned: 7, orphans: 1, blobDeletes: 0, chunkDeletes: 0, oversizedSkipped: 1 },
  ]
  const run = async (name, args) => { calls.push([name, args]); return pages.shift() }
  const totals = await cleanupOrphanBlobs(run, { dryRun: true, log: () => {} })
  assert.deepEqual(totals, { scanned: 107, orphans: 3, blobDeletes: 0, chunkDeletes: 0, oversizedSkipped: 1, pages: 2 })
  assert.ok(calls.every(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === true && args.limit === 100))
  await assert.rejects(cleanupOrphanBlobs(async () => ({ isDone: false, scanned: 1 }), { dryRun: true, log: () => {} }), /continuation cursor/)
})

test('runs workers with bounded concurrency and preserves order', async () => {
  let active = 0
  let peak = 0
  const result = await mapWithConcurrency([30, 10, 20, 5], 2, async (ms) => {
    active += 1; peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, ms))
    active -= 1
    return ms * 2
  })
  assert.deepEqual(result, [60, 20, 40, 10])
  assert.equal(peak, 2)
})

test('dry run never calls deletion and apply deletes only the selected releases', async () => {
  const inactive = [
    release({ ingestedAt: at(12), datasetReleaseId: 'legacy', manifestBasis: 'legacy_unverified_aliases', manifestVerified: false, manifestError: 'LEGACY_ALIAS_EXPECTATION_UNKNOWN' }),
    release({ ingestedAt: at(2), datasetReleaseId: 'keep' }),
    release({ ingestedAt: at(0.2), datasetReleaseId: 'fresh' }),
  ]
  const runner = () => {
    const calls = []
    const run = async (name, args) => {
      calls.push([name, args])
      if (name === 'maintenance:previewInactiveReleases') return { inactive, isDone: true, continueCursor: null }
      if (name === 'maintenance:deleteInactiveReleaseBatch') return { datasetReleaseId: args.datasetReleaseId, deleted: 1, deletedByTable: { datasetReleases: 1 }, deletedRelease: true, hasMore: false }
      return { isDone: true, continueCursor: null, scanned: 0, orphans: 0, blobDeletes: 0, chunkDeletes: 0, oversizedSkipped: 0 }
    }
    return { run, calls }
  }
  const dry = runner()
  const dryResult = await prune(dry.run, { ...policy, apply: false, concurrency: 2 }, { log: () => {} })
  assert.equal(dryResult.selection.prune.length, 1)
  assert.ok(!dry.calls.some(([name]) => name === 'maintenance:deleteInactiveReleaseBatch'))
  assert.ok(dry.calls.some(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === true))

  const wet = runner()
  const wetResult = await prune(wet.run, { ...policy, apply: true, concurrency: 2 }, { log: () => {} })
  const deletions = wet.calls.filter(([name]) => name === 'maintenance:deleteInactiveReleaseBatch')
  assert.deepEqual(deletions.map(([, args]) => args.datasetReleaseId), ['legacy'])
  assert.equal(wetResult.pruned.length, 1)
  assert.ok(wet.calls.some(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === false))
})

const readRepositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('pruning is wired as a manual, dry-run-default workflow that cannot overlap ingestion', () => {
  const pkg = JSON.parse(readRepositoryFile('package.json'))
  assert.equal(pkg.scripts['convex:prune-releases'], 'node scripts/prune-inactive-releases.mjs')
  assert.ok(pkg.scripts['ops:test'].split(/\s+/).includes('scripts/prune-inactive-releases.test.mjs'))
  const workflow = readRepositoryFile('.github/workflows/prune-releases.yml')
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m)
  assert.doesNotMatch(workflow, /^\s+schedule:|^\s+push:|^\s+pull_request:/m)
  assert.match(workflow, /apply:\n(?:.*\n){1,4}?\s+default: false/)
  assert.match(workflow, /concurrency:\n  group: update-dataset\n  cancel-in-progress: false/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /BETTERMAN_PRUNE_APPLY: \$\{\{ inputs\.apply && 'true' \|\| 'false' \}\}/)
  assert.doesNotMatch(workflow, /continue-on-error:/)
})
