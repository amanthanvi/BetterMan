import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  cleanupOrphanBlobs, describeError, limitForAttempt, listInactiveReleases, mapWithConcurrency, parseOptions, prune, pruneRelease,
  selectPrunable, withRetry,
} from './prune-inactive-releases.mjs'

const now = Date.parse('2026-09-14T18:00:00Z')
const hour = 60 * 60 * 1000
const day = 24 * hour
const policy = { keepPerDistro: 1, minAgeMs: day, now }
const quiet = { log: () => {} }
const noPause = { pause: async () => {}, log: () => {} }
const release = (overrides) => ({
  datasetReleaseId: `r-${overrides.ingestedAt}-${overrides.distro ?? 'debian'}`, locale: 'en', distro: 'debian',
  sealed: true, pruning: false, manifestBasis: 'declared', manifestVerified: true, manifestError: null, ...overrides,
})
const at = (daysAgo) => new Date(now - daysAgo * day).toISOString()

test('parses environment options with safe defaults and rejects unsafe values', () => {
  assert.deepEqual(parseOptions({}, now), {
    apply: false, keepPerDistro: 1, minAgeMs: day, unsealedMinAgeMs: null, sweepOrphans: false, concurrency: 4, now,
  })
  const applied = parseOptions({ BETTERMAN_PRUNE_APPLY: 'true', BETTERMAN_PRUNE_KEEP_PER_DISTRO: '2', BETTERMAN_PRUNE_UNSEALED_MIN_AGE_HOURS: '72' }, now)
  assert.equal(applied.keepPerDistro, 2)
  assert.equal(applied.unsealedMinAgeMs, 72 * hour)
  assert.equal(applied.sweepOrphans, true, 'apply sweeps orphans by default')
  assert.equal(parseOptions({ BETTERMAN_PRUNE_APPLY: 'true', BETTERMAN_PRUNE_SWEEP_ORPHANS: 'false' }, now).sweepOrphans, false)
  assert.equal(parseOptions({ BETTERMAN_PRUNE_SWEEP_ORPHANS: 'true' }, now).sweepOrphans, true)
  assert.equal(parseOptions({ BETTERMAN_PRUNE_APPLY: 'yes' }, now).apply, false)
  // A rollback target must always remain and the age floor must be real.
  assert.throws(() => parseOptions({ BETTERMAN_PRUNE_KEEP_PER_DISTRO: '0' }, now), /integer >= 1/)
  assert.throws(() => parseOptions({ BETTERMAN_PRUNE_MIN_AGE_HOURS: '0' }, now), /integer >= 1/)
  for (const bad of ['-1', '1.5', 'abc', '1e3']) {
    assert.throws(() => parseOptions({ BETTERMAN_PRUNE_KEEP_PER_DISTRO: bad }, now), /integer >= 1/)
  }
})

test('never selects unsealed drafts by default and always finishes started prunes', () => {
  const { prune: selected, skipped } = selectPrunable([
    release({ ingestedAt: at(30), sealed: false, manifestVerified: false, datasetReleaseId: 'abandoned' }),
    release({ ingestedAt: at(0.1), datasetReleaseId: 'started', pruning: true, sealed: false }),
  ], policy)
  assert.deepEqual(selected.map((r) => [r.datasetReleaseId, r.reason]), [['started', 'pruning already started']])
  assert.deepEqual(skipped.map((r) => [r.datasetReleaseId, r.reason]), [['abandoned', 'unsealed upload in progress']])
})

test('prunes abandoned unsealed drafts only when the operator sets an unsealed age floor', () => {
  const inactive = [
    release({ ingestedAt: at(30), sealed: false, manifestVerified: false, datasetReleaseId: 'abandoned' }),
    release({ ingestedAt: at(1), sealed: false, manifestVerified: false, datasetReleaseId: 'uploading' }),
  ]
  const result = selectPrunable(inactive, { ...policy, unsealedMinAgeMs: 7 * day })
  assert.deepEqual(result.prune.map((r) => r.datasetReleaseId), ['abandoned'])
  assert.deepEqual(result.skipped.map((r) => r.datasetReleaseId), ['uploading'])
})

test('applies the age floor only to declared releases that could still activate', () => {
  const result = selectPrunable([
    release({ ingestedAt: at(0.1), datasetReleaseId: 'fresh-verified' }),
    release({ ingestedAt: at(0.1), datasetReleaseId: 'fresh-unverified', manifestVerified: false }),
    release({ ingestedAt: at(0.1), datasetReleaseId: 'fresh-legacy', manifestBasis: 'legacy_unverified_aliases', manifestVerified: false, manifestError: 'LEGACY_ALIAS_EXPECTATION_UNKNOWN' }),
    release({ ingestedAt: at(0.1), datasetReleaseId: 'fresh-failed', manifestVerified: false, manifestError: 'LEGACY_PAGE_COUNT_MISMATCH' }),
    release({ ingestedAt: at(3), datasetReleaseId: 'old-unverified', manifestVerified: false }),
  ], policy)
  assert.deepEqual(result.prune.map((r) => r.datasetReleaseId).sort(), ['fresh-failed', 'fresh-legacy', 'old-unverified'])
  assert.deepEqual(result.skipped.map((r) => r.datasetReleaseId).sort(), ['fresh-unverified', 'fresh-verified'])
  assert.deepEqual(result.retained, [])
  assert.match(result.prune.find((r) => r.datasetReleaseId === 'old-unverified').reason, /without verification/)
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
  assert.equal(selectPrunable(inactive, { ...policy, keepPerDistro: 5 }).prune.length, 3)
})

test('prefers server creation time over client ingestedAt for the age floor', () => {
  const backdated = release({ ingestedAt: at(10), createdAt: at(0.1), datasetReleaseId: 'backdated' })
  assert.deepEqual(selectPrunable([backdated], policy).skipped.map((r) => r.datasetReleaseId), ['backdated'])
  const genuine = release({ ingestedAt: at(0.1), createdAt: at(10), datasetReleaseId: 'genuine' })
  assert.deepEqual(selectPrunable([genuine], policy).retained.map((r) => r.datasetReleaseId), ['genuine'])
})

test('rejects malformed preview entries instead of guessing', () => {
  assert.throws(() => selectPrunable([{ sealed: true }], policy), /Invalid inactive release/)
  assert.throws(() => selectPrunable([release({ ingestedAt: at(3), datasetReleaseId: '  ' })], policy), /Invalid inactive release/)
  assert.deepEqual(selectPrunable([release({ ingestedAt: 'not a date', datasetReleaseId: 'x' })], policy).skipped.map((r) => r.reason), ['younger than the minimum age'])
})

test('retries transient failures with shrinking batch limits, then surfaces the last error', async () => {
  let calls = 0
  const result = await withRetry(async (attempt) => { calls += 1; if (attempt < 3) throw new Error('flaky'); return attempt }, { ...noPause, attempts: 4 })
  assert.equal(result, 3)
  assert.equal(calls, 3)
  await assert.rejects(withRetry(async () => { throw new Error('always') }, { ...noPause, attempts: 2 }), /always/)
  assert.deepEqual([1, 2, 3, 4, 9].map((attempt) => limitForAttempt({ start: 100, min: 5 }, attempt)), [100, 50, 25, 12, 5])
})

test('pages through every inactive release and rejects duplicates or missing cursors', async () => {
  const calls = []
  const pages = [
    { inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: 'c1' },
    { inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'b' })], isDone: true, continueCursor: null },
  ]
  const run = async (name, args) => { calls.push([name, args]); return pages.shift() }
  const result = await listInactiveReleases(run, noPause)
  assert.deepEqual(result.map((r) => r.datasetReleaseId), ['a', 'b'])
  assert.deepEqual(calls.map(([, args]) => args.cursor), [null, 'c1'])
  assert.ok(calls.every(([name, args]) => name === 'maintenance:previewInactiveReleases' && args.limit === 10))

  await assert.rejects(listInactiveReleases(async () => ({ inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: null }), noPause), /continuation cursor/)
  await assert.rejects(listInactiveReleases(async () => ({ inactive: [release({ ingestedAt: at(3), datasetReleaseId: 'a' })], isDone: false, continueCursor: 'same' }), noPause), /Duplicate release/)
  await assert.rejects(listInactiveReleases(async () => ({}), noPause), /Invalid inactive release preview response/)
})

test('deletes one release in bounded confirmed batches until the release row is gone', async () => {
  const calls = []
  const responses = [
    { datasetReleaseId: 'r', deleted: 100, storageDeletes: 40, deletedByTable: { manPages: 60, manPageLinks: 40 }, deletedRelease: false, hasMore: true },
    { datasetReleaseId: 'r', deleted: 3, storageDeletes: 1, deletedByTable: { manPages: 2, datasetReleases: 1 }, deletedRelease: true, hasMore: false },
  ]
  const run = async (name, args) => { calls.push([name, args]); return responses.shift() }
  const result = await pruneRelease(run, 'r', { ...quiet, retry: noPause })
  assert.deepEqual(result, { datasetReleaseId: 'r', batches: 2, deleted: 103, storageDeletes: 41, deletedByTable: { manPages: 62, manPageLinks: 40, datasetReleases: 1 } })
  assert.deepEqual(calls[0], ['maintenance:deleteInactiveReleaseBatch', { datasetReleaseId: 'r', confirmDatasetReleaseId: 'r', maxDocs: 100 }])
})

test('shrinks the deletion batch after a failed attempt', async () => {
  const sizes = []
  let failed = false
  const run = async (name, args) => {
    sizes.push(args.maxDocs)
    if (!failed) { failed = true; throw new Error('Transaction too large') }
    return { datasetReleaseId: 'r', deleted: 1, deletedByTable: { datasetReleases: 1 }, deletedRelease: true, hasMore: false }
  }
  await pruneRelease(run, 'r', { ...quiet, retry: noPause })
  assert.deepEqual(sizes, [100, 50])
})

test('stops on stalled, mismatched, or failing deletions', async () => {
  const opts = { ...quiet, retry: { ...noPause, attempts: 1 } }
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'r', deleted: 0, deletedByTable: {}, deletedRelease: false, hasMore: true }), 'r', opts), /no progress/)
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'r', deleted: 5, deletedByTable: {}, deletedRelease: false, hasMore: false }), 'r', opts), /stalled/)
  await assert.rejects(pruneRelease(async () => ({ datasetReleaseId: 'other', deleted: 5, deletedByTable: {}, deletedRelease: true, hasMore: false }), 'r', opts), /Invalid deletion response/)
  await assert.rejects(pruneRelease(async () => { throw new Error('REFUSING_TO_DELETE_ACTIVE_RELEASE') }, 'r', opts), /REFUSING_TO_DELETE_ACTIVE_RELEASE/)
})

test('sweeps orphan blobs across every page and honours dry run', async () => {
  const calls = []
  const pages = [
    { isDone: false, continueCursor: 'n', scanned: 50, orphans: 2, blobDeletes: 0, chunkDeletes: 0, storageDeletes: 0, oversizedSkipped: 0 },
    { isDone: true, continueCursor: null, scanned: 7, orphans: 1, blobDeletes: 0, chunkDeletes: 0, storageDeletes: 0, oversizedSkipped: 1 },
  ]
  const run = async (name, args) => { calls.push([name, args]); return pages.shift() }
  const totals = await cleanupOrphanBlobs(run, { dryRun: true, ...quiet, retry: noPause })
  assert.deepEqual(totals, { scanned: 57, orphans: 3, blobDeletes: 0, chunkDeletes: 0, storageDeletes: 0, oversizedSkipped: 1, pages: 2 })
  assert.ok(calls.every(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === true && args.limit === 50))
  await assert.rejects(cleanupOrphanBlobs(async () => ({ isDone: false, scanned: 1 }), { dryRun: true, ...quiet, retry: noPause }), /continuation cursor/)
})

test('bounded concurrency preserves order and stops handing out work after a failure', async () => {
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

  const started = []
  await assert.rejects(mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
    started.push(item)
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (item === 1) throw new Error('boom')
  }), /boom/)
  // Items 1 and 2 were in flight; nothing else may start once 1 fails.
  assert.deepEqual(started, [1, 2])
})

test('dry run never deletes or sweeps, apply deletes only the selected releases then sweeps', async () => {
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
      if (name === 'maintenance:deleteInactiveReleaseBatch') return { datasetReleaseId: args.datasetReleaseId, deleted: 1, storageDeletes: 0, deletedByTable: { datasetReleases: 1 }, deletedRelease: true, hasMore: false }
      return { isDone: true, continueCursor: null, scanned: 0, orphans: 0, blobDeletes: 0, chunkDeletes: 0, storageDeletes: 0, oversizedSkipped: 0 }
    }
    return { run, calls }
  }
  const dry = runner()
  const dryResult = await prune(dry.run, { ...parseOptions({}, now), concurrency: 2 }, { ...quiet, retry: noPause })
  assert.equal(dryResult.selection.prune.length, 1)
  assert.equal(dryResult.orphans, null)
  assert.deepEqual([...new Set(dry.calls.map(([name]) => name))], ['maintenance:previewInactiveReleases'])

  const preview = runner()
  await prune(preview.run, { ...parseOptions({ BETTERMAN_PRUNE_SWEEP_ORPHANS: 'true' }, now), concurrency: 2 }, { ...quiet, retry: noPause })
  assert.ok(preview.calls.some(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === true))
  assert.ok(!preview.calls.some(([name]) => name === 'maintenance:deleteInactiveReleaseBatch'))

  const wet = runner()
  const wetResult = await prune(wet.run, { ...parseOptions({ BETTERMAN_PRUNE_APPLY: 'true' }, now), concurrency: 2 }, { ...quiet, retry: noPause })
  const deletions = wet.calls.filter(([name]) => name === 'maintenance:deleteInactiveReleaseBatch')
  assert.deepEqual(deletions.map(([, args]) => args.datasetReleaseId), ['legacy'])
  assert.equal(wetResult.pruned.length, 1)
  assert.ok(wet.calls.some(([name, args]) => name === 'maintenance:cleanupOrphanContentBlobsBatch' && args.dryRun === false))
})

test('surfaces provider stderr in failures and redacts deploy keys', () => {
  const error = Object.assign(new Error('Command failed'), {
    code: 1,
    stderr: 'spinner\n✖ Error: [Request ID: abc] Server Error\nUncaught Error: REFUSING_TO_DELETE_ACTIVE_RELEASE\n  at handler\n',
  })
  const described = describeError(error)
  assert.match(described, /^exit 1: /)
  assert.match(described, /REFUSING_TO_DELETE_ACTIVE_RELEASE/)
  assert.equal(describeError(new Error('plain')), 'plain')
  assert.equal(describeError(Object.assign(new Error('x'), { code: 1, stderr: 'set CONVEX_DEPLOY_KEY prod:happy-animal-123|eyJ2MiI6ImFiYyJ9 now' })),
    'exit 1: set CONVEX_DEPLOY_KEY prod:<redacted> now')
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
  // Trusted tooling is verified before the deploy key is exposed.
  const steps = workflow.split('\n      - ').slice(1)
  const provenance = steps.findIndex((step) => step.includes('deps:provenance'))
  const secret = steps.findIndex((step) => step.includes('CONVEX_DEPLOY_KEY'))
  assert.ok(provenance >= 0 && secret > provenance, 'provenance gate must precede deploy-key exposure')
})
