#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

// Convex bounds: previewInactiveReleases pages at most 10 releases, and
// deleteInactiveReleaseBatch removes at most 200 documents per transaction.
const PREVIEW_LIMIT = 10
const DELETE_LIMIT = 200
const ORPHAN_LIMIT = 100
const MAX_BATCHES_PER_RELEASE = 50_000

export function parseOptions(env = process.env, now = Date.now()) {
  const apply = env.BETTERMAN_PRUNE_APPLY === 'true'
  const keepPerDistro = parseCount(env.BETTERMAN_PRUNE_KEEP_PER_DISTRO, 1, 'BETTERMAN_PRUNE_KEEP_PER_DISTRO')
  const minAgeHours = parseCount(env.BETTERMAN_PRUNE_MIN_AGE_HOURS, 24, 'BETTERMAN_PRUNE_MIN_AGE_HOURS')
  const concurrency = Math.max(1, parseCount(env.BETTERMAN_PRUNE_CONCURRENCY, 4, 'BETTERMAN_PRUNE_CONCURRENCY'))
  return { apply, keepPerDistro, minAgeMs: minAgeHours * 60 * 60 * 1000, concurrency, now }
}

function parseCount(raw, fallback, name) {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value < 0 || String(value) !== raw.trim()) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

// Decide which inactive releases to delete. Everything here is defensive on
// top of deleteInactiveReleaseBatch, which itself refuses active releases.
//
// - Unsealed releases are uploads in progress; never touch them.
// - Recent releases may be mid-activation (sealed, hydrating, not yet pointed
//   at); an age floor plus the shared workflow concurrency group excludes them.
// - Releases already marked pruning are finished regardless of age or policy.
// - The newest `keepPerDistro` verified declared releases per distro stay as
//   activatable rollback candidates. Legacy or failed manifests can never be
//   activated again, so they are never worth retaining.
export function selectPrunable(inactive, { keepPerDistro, minAgeMs, now }) {
  const prune = []
  const retained = []
  const skipped = []
  const rollbackCandidates = new Map()

  const sorted = [...inactive].sort((a, b) => releaseTime(b) - releaseTime(a))
  for (const release of sorted) {
    if (typeof release?.datasetReleaseId !== 'string' || !release.datasetReleaseId.trim()
      || typeof release.distro !== 'string' || typeof release.locale !== 'string') {
      throw new Error('Invalid inactive release preview entry')
    }
    if (release.pruning === true) {
      prune.push({ ...release, reason: 'pruning already started' })
      continue
    }
    if (release.sealed !== true) {
      skipped.push({ ...release, reason: 'unsealed upload in progress' })
      continue
    }
    const age = now - releaseTime(release)
    if (!Number.isFinite(age) || age < minAgeMs) {
      skipped.push({ ...release, reason: 'younger than the minimum age' })
      continue
    }
    const activatable = release.manifestBasis === 'declared' && release.manifestVerified === true
    const key = `${release.locale}/${release.distro}`
    if (activatable) {
      const kept = rollbackCandidates.get(key) ?? 0
      if (kept < keepPerDistro) {
        rollbackCandidates.set(key, kept + 1)
        retained.push({ ...release, reason: 'retained verified rollback candidate' })
        continue
      }
      prune.push({ ...release, reason: 'superseded verified release beyond retention' })
      continue
    }
    prune.push({ ...release, reason: `not activatable (${release.manifestBasis ?? 'undeclared'}${release.manifestError ? `: ${release.manifestError}` : ''})` })
  }
  return { prune, retained, skipped }
}

function releaseTime(release) {
  const parsed = Date.parse(release?.ingestedAt ?? '')
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export async function listInactiveReleases(run) {
  const inactive = []
  const seen = new Set()
  let cursor = null
  for (let page = 0; page < 10_000; page += 1) {
    const result = await run('maintenance:previewInactiveReleases', { cursor, limit: PREVIEW_LIMIT, childSampleLimit: 1 })
    if (!Array.isArray(result?.inactive) || typeof result.isDone !== 'boolean') {
      throw new Error('Invalid inactive release preview response')
    }
    for (const release of result.inactive) {
      if (seen.has(release.datasetReleaseId)) throw new Error(`Duplicate release in preview: ${release.datasetReleaseId}`)
      seen.add(release.datasetReleaseId)
      inactive.push(release)
    }
    if (result.isDone) return inactive
    if (typeof result.continueCursor !== 'string' || !result.continueCursor) throw new Error('Preview did not return a continuation cursor')
    cursor = result.continueCursor
  }
  throw new Error('Inactive release preview did not terminate')
}

export async function pruneRelease(run, datasetReleaseId, { log = console.log } = {}) {
  let deleted = 0
  const deletedByTable = {}
  for (let batch = 0; batch < MAX_BATCHES_PER_RELEASE; batch += 1) {
    const result = await run('maintenance:deleteInactiveReleaseBatch', {
      datasetReleaseId, confirmDatasetReleaseId: datasetReleaseId, maxDocs: DELETE_LIMIT,
    })
    if (result?.datasetReleaseId !== datasetReleaseId || !Number.isSafeInteger(result.deleted)
      || typeof result.deletedRelease !== 'boolean' || typeof result.hasMore !== 'boolean') {
      throw new Error(`Invalid deletion response for ${datasetReleaseId}`)
    }
    deleted += result.deleted
    for (const [table, count] of Object.entries(result.deletedByTable ?? {})) {
      deletedByTable[table] = (deletedByTable[table] ?? 0) + count
    }
    if (batch % 25 === 0) log(JSON.stringify({ event: 'prune_progress', datasetReleaseId, batches: batch + 1, deleted }))
    if (result.deletedRelease) return { datasetReleaseId, batches: batch + 1, deleted, deletedByTable }
    if (!result.hasMore) throw new Error(`Deletion stalled without removing ${datasetReleaseId}`)
    // A batch that deletes nothing while claiming more work would loop forever.
    if (result.deleted === 0) throw new Error(`Deletion made no progress for ${datasetReleaseId}`)
  }
  throw new Error(`Deletion exceeded the batch budget for ${datasetReleaseId}`)
}

export async function cleanupOrphanBlobs(run, { dryRun, log = console.log } = {}) {
  const totals = { scanned: 0, orphans: 0, blobDeletes: 0, chunkDeletes: 0, oversizedSkipped: 0, pages: 0 }
  let cursor = null
  for (let page = 0; page < 1_000_000; page += 1) {
    const result = await run('maintenance:cleanupOrphanContentBlobsBatch', { cursor, limit: ORPHAN_LIMIT, dryRun })
    if (typeof result?.isDone !== 'boolean' || !Number.isSafeInteger(result.scanned)) {
      throw new Error('Invalid orphan blob cleanup response')
    }
    totals.pages += 1
    for (const key of ['scanned', 'orphans', 'blobDeletes', 'chunkDeletes', 'oversizedSkipped']) totals[key] += result[key] ?? 0
    if (totals.pages % 50 === 0) log(JSON.stringify({ event: 'orphan_progress', dryRun, ...totals }))
    if (result.isDone) return totals
    if (typeof result.continueCursor !== 'string' || !result.continueCursor) throw new Error('Orphan cleanup did not return a continuation cursor')
    cursor = result.continueCursor
  }
  throw new Error('Orphan blob cleanup did not terminate')
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

export async function prune(run, options, { log = console.log } = {}) {
  const inactive = await listInactiveReleases(run)
  const selection = selectPrunable(inactive, options)
  const summary = (entries) => entries.map(({ datasetReleaseId, distro, ingestedAt, reason }) => ({ datasetReleaseId, distro, ingestedAt, reason }))
  log(JSON.stringify({
    event: 'prune_plan', apply: options.apply, keepPerDistro: options.keepPerDistro, minAgeHours: options.minAgeMs / 3_600_000,
    inactive: inactive.length, prune: summary(selection.prune), retained: summary(selection.retained), skipped: summary(selection.skipped),
  }))

  let pruned = []
  if (options.apply) {
    pruned = await mapWithConcurrency(selection.prune, options.concurrency, (release) => pruneRelease(run, release.datasetReleaseId, { log }))
    for (const result of pruned) log(JSON.stringify({ event: 'prune_release', ...result }))
  }
  const orphans = await cleanupOrphanBlobs(run, { dryRun: !options.apply, log })
  return { inactive: inactive.length, selection, pruned, orphans }
}

function convexRunner() {
  if (!process.env.CONVEX_DEPLOY_KEY?.trim()) throw new Error('CONVEX_DEPLOY_KEY is required')
  return async (functionName, args) => {
    const { stdout } = await exec('pnpm', ['exec', 'convex', 'run', '--prod', functionName, JSON.stringify(args)], {
      encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    })
    return JSON.parse(stdout)
  }
}

async function main() {
  const options = parseOptions()
  const result = await prune(convexRunner(), options)
  const deleted = result.pruned.reduce((sum, item) => sum + item.deleted, 0)
  const message = options.apply
    ? `Pruned ${result.pruned.length} inactive release(s) (${deleted} documents), retained ${result.selection.retained.length}, skipped ${result.selection.skipped.length}; removed ${result.orphans.blobDeletes} orphan content blob(s).`
    : `Dry run: ${result.selection.prune.length} inactive release(s) would be pruned, ${result.selection.retained.length} retained, ${result.selection.skipped.length} skipped; ${result.orphans.orphans} orphan content blob(s) found.`
  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Child-process errors may contain provider output; never echo credentials.
    console.error(error.code !== undefined ? `Release pruning failed (${error.code})` : error.message)
    process.exitCode = 1
  })
}
