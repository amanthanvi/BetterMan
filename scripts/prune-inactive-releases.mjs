#!/usr/bin/env node

import { appendFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

// Convex bounds: previewInactiveReleases pages at most 10 releases,
// deleteInactiveReleaseBatch removes at most 2,000 documents per transaction,
// and sweeps use their server maxima. Batches halve on failure so a heavy
// page (large inline payloads, many chunks) degrades instead of stalling the run. After
// GROW_AFTER clean batches they double again, up to their start (see
// adaptiveLimit).
const PREVIEW_LIMIT = 10
const DELETE_LIMIT = { start: 1000, min: 5 }
const DERIVED_TABLES = ['derivedSignatureCache', 'derivedLegacySignatures', 'manPageSymbols']
const SWEEPS = ['all', 'blobs', 'manifests', ...DERIVED_TABLES]
const MAX_BATCHES_PER_RELEASE = 100_000
const MAX_ATTEMPTS = 10
const GROW_AFTER = 10

export function parseOptions(env = process.env, now = Date.now()) {
  const apply = env.BETTERMAN_PRUNE_APPLY === 'true'
  // A rollback target must always remain, and the age floor must be real.
  const keepPerDistro = parseCount(env.BETTERMAN_PRUNE_KEEP_PER_DISTRO, 1, 'BETTERMAN_PRUNE_KEEP_PER_DISTRO', 1)
  const minAgeHours = parseCount(env.BETTERMAN_PRUNE_MIN_AGE_HOURS, 24, 'BETTERMAN_PRUNE_MIN_AGE_HOURS', 1)
  // 0 disables pruning of unsealed drafts (uploads that never activated).
  const unsealedMinAgeHours = parseCount(env.BETTERMAN_PRUNE_UNSEALED_MIN_AGE_HOURS, 0, 'BETTERMAN_PRUNE_UNSEALED_MIN_AGE_HOURS', 0)
  const sweepOnly = parseFlag(env.BETTERMAN_PRUNE_SWEEP_ONLY, false, 'BETTERMAN_PRUNE_SWEEP_ONLY')
  const sweep = env.BETTERMAN_PRUNE_SWEEP?.trim() || 'all'
  if (!SWEEPS.includes(sweep)) throw new Error('Invalid sweep selection')
  const startCursor = env.BETTERMAN_PRUNE_START_CURSOR || null
  if (startCursor && sweep === 'all') throw new Error('A start cursor requires a single sweep')
  const sweepOrphans = parseFlag(env.BETTERMAN_PRUNE_SWEEP_ORPHANS, apply || sweepOnly, 'BETTERMAN_PRUNE_SWEEP_ORPHANS')
  const concurrency = parseCount(env.BETTERMAN_PRUNE_CONCURRENCY, 4, 'BETTERMAN_PRUNE_CONCURRENCY', 1)
  return {
    apply, keepPerDistro, minAgeMs: minAgeHours * 3_600_000,
    unsealedMinAgeMs: unsealedMinAgeHours > 0 ? unsealedMinAgeHours * 3_600_000 : null,
    sweepOrphans, sweepOnly, sweep, startCursor, concurrency, now,
  }
}

// Workflow inputs arrive as strings; an empty string means "not set".
function parseFlag(raw, fallback, name) {
  if (raw === undefined || raw.trim() === '') return fallback
  if (raw.trim() === 'true') return true
  if (raw.trim() === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function parseCount(raw, fallback, name, minimum) {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || String(value) !== raw.trim() || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`)
  }
  return value
}

// Decide which inactive releases to delete. Everything here is defensive on
// top of deleteInactiveReleaseBatch, which itself refuses active releases and
// marks a release `pruning` before its first child delete so it can never be
// activated afterwards.
//
// - Releases already marked pruning are finished regardless of policy.
// - Unsealed releases are uploads that never activated. Complete declared
//   uploads are still activatable and are always kept; incomplete drafts are
//   kept unless the operator opts in with an age floor for abandoned uploads.
// - Sealed releases that are legacy or recorded a verification failure can
//   never be activated (activation rejects them), so their age is irrelevant.
// - Sealed declared releases may be mid-activation (hydrating, not yet pointed
//   at), so an age floor plus the shared workflow concurrency group excludes
//   recent ones. Beyond the floor, the newest `keepPerDistro` verified releases
//   per distro remain as rollback candidates; the rest are superseded.
export function selectPrunable(inactive, { keepPerDistro, minAgeMs, unsealedMinAgeMs = null, now }) {
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
    const pins = release.derivedPins
    if (pins?.pinned === true || pins?.required === true || pins?.pendingRefs > 0 || pins?.readyRows > 0) {
      skipped.push({ ...release, reason: `derived dependencies pinned (required=${pins.required === true}, pending=${pins.pendingRefs ?? 0}, ready=${pins.readyRows ?? 0})` })
      continue
    }
    if (release.pruning === true) {
      prune.push({ ...release, reason: 'pruning already started' })
      continue
    }
    const age = now - releaseTime(release)
    if (!Number.isFinite(age)) throw new Error(`Invalid release time for ${release.datasetReleaseId}`)
    if (release.sealed !== true) {
      // A complete declared upload is activatable exactly as it stands; only
      // incomplete drafts can be abandoned.
      if (release.uploadComplete === true) {
        skipped.push({ ...release, reason: 'unsealed but complete; activatable' })
      } else if (unsealedMinAgeMs !== null && age >= unsealedMinAgeMs) {
        prune.push({ ...release, reason: 'abandoned incomplete upload beyond the unsealed age floor' })
      } else {
        skipped.push({ ...release, reason: 'unsealed upload in progress' })
      }
      continue
    }
    // Legacy manifests and recorded verification failures are terminal:
    // activation rejects them, so age cannot make them a rollback target.
    if (release.manifestBasis !== 'declared' || release.manifestError) {
      prune.push({ ...release, reason: `not activatable (${release.manifestBasis ?? 'undeclared'}${release.manifestError ? `: ${release.manifestError}` : ''})` })
      continue
    }
    // Declared releases may still be mid-activation; the age floor covers that.
    if (age < minAgeMs) {
      skipped.push({ ...release, reason: 'younger than the minimum age' })
      continue
    }
    if (release.manifestVerified !== true) {
      prune.push({ ...release, reason: 'declared release sealed without verification' })
      continue
    }
    const key = `${release.locale}/${release.distro}`
    const kept = rollbackCandidates.get(key) ?? 0
    if (kept < keepPerDistro) {
      rollbackCandidates.set(key, kept + 1)
      retained.push({ ...release, reason: 'retained verified rollback candidate' })
      continue
    }
    prune.push({ ...release, reason: 'superseded verified release beyond retention' })
  }
  return { prune, retained, skipped }
}

// Prefer the server-assigned creation time; ingestedAt is client-supplied and
// marks the start of upload. Either way the value precedes activation, so the
// age floor is conservative.
function releaseTime(release) {
  const created = Date.parse(release?.createdAt ?? '')
  if (Number.isFinite(created)) return created
  const ingested = Date.parse(release?.ingestedAt ?? '')
  return Number.isFinite(ingested) ? ingested : Number.NaN
}

// Retry transient failures with backoff. Every function we call is idempotent
// per batch: previews and dry runs read, deletions remove whatever remains.
export async function withRetry(operation, { attempts = MAX_ATTEMPTS, pause = sleep, log = console.log, label, shouldRetry = () => true } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt === attempts || !shouldRetry(error)) break
      log(JSON.stringify({ event: 'retry', label, attempt, error: describeError(error) }))
      await pause(Math.min(30_000, 1_000 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

// Batch limits halve on each failed attempt so oversized transactions shrink
// instead of failing identically forever.
export function limitForAttempt({ start, min }, attempt) {
  return Math.max(min, Math.floor(start / 2 ** (attempt - 1)))
}

// Once a smaller batch succeeds, later batches keep that size rather than
// re-escalating and paying the failed attempts again on every batch. The size
// doubles back toward the start after `growAfter` batches in a row succeed on
// their first attempt: the failures are often transient, and without regrowth
// one bad streak pinned a release at the minimum for hours (#528). When the
// first batch at a grown size fails, that size is probably too big for the
// data, not unlucky, so the streak needed before the next try doubles (up to
// `maxGrowAfter`). A probe that succeeds resets it.
export function adaptiveLimit(bounds, { growAfter = GROW_AFTER, maxGrowAfter = GROW_AFTER * 32 } = {}) {
  let start = bounds.start
  let lastAttempted = start
  let lastAttempt = 1
  let cleanStreak = 0
  let required = growAfter
  let probing = false
  return {
    forAttempt(attempt) {
      lastAttempt = attempt
      lastAttempted = limitForAttempt({ start, min: bounds.min }, attempt)
      return lastAttempted
    },
    succeeded() {
      const probed = probing
      probing = false
      if (lastAttempt > 1) {
        if (probed) required = Math.min(maxGrowAfter, required * 2)
        start = lastAttempted
        cleanStreak = 0
        return
      }
      if (probed) required = growAfter
      cleanStreak += 1
      if (cleanStreak >= required && start < bounds.start) {
        start = Math.min(bounds.start, start * 2)
        cleanStreak = 0
        probing = true
      }
    },
    get current() {
      return start
    },
  }
}

export async function listInactiveReleases(run, retry = {}) {
  const inactive = []
  const seen = new Set()
  let cursor = null
  for (let page = 0; page < 10_000; page += 1) {
    const result = await withRetry(() => run('maintenance:previewInactiveReleases', { cursor, limit: PREVIEW_LIMIT, childSampleLimit: 1 }), { ...retry, label: 'preview' })
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

export function isDerivedPinnedError(error) {
  return /\bRELEASE_DERIVED_BUILD_IN_PROGRESS\b/.test(describeError(error))
}

export async function pruneRelease(run, datasetReleaseId, { log = console.log, retry = {} } = {}) {
  let deleted = 0
  let storageDeletes = 0
  const deletedByTable = {}
  const limit = adaptiveLimit(DELETE_LIMIT)
  for (let batch = 0; batch < MAX_BATCHES_PER_RELEASE; batch += 1) {
    const result = await withRetry((attempt) => run('maintenance:deleteInactiveReleaseBatch', {
      datasetReleaseId, confirmDatasetReleaseId: datasetReleaseId, maxDocs: limit.forAttempt(attempt),
    }), { ...retry, log, label: `delete ${datasetReleaseId}`, shouldRetry: (error) => !isDerivedPinnedError(error) })
    limit.succeeded()
    if (result?.datasetReleaseId !== datasetReleaseId || !Number.isSafeInteger(result.deleted)
      || typeof result.deletedRelease !== 'boolean' || typeof result.hasMore !== 'boolean') {
      throw new Error(`Invalid deletion response for ${datasetReleaseId}`)
    }
    deleted += result.deleted
    storageDeletes += result.storageDeletes ?? 0
    for (const [table, count] of Object.entries(result.deletedByTable ?? {})) {
      deletedByTable[table] = (deletedByTable[table] ?? 0) + count
    }
    if (batch % 25 === 0) log(JSON.stringify({ event: 'prune_progress', datasetReleaseId, batches: batch + 1, deleted, maxDocs: limit.current }))
    if (result.deletedRelease) return { datasetReleaseId, batches: batch + 1, deleted, storageDeletes, deletedByTable }
    if (!result.hasMore) throw new Error(`Deletion stalled without removing ${datasetReleaseId}`)
    // A batch that deletes nothing while claiming more work would loop forever.
    if (result.deleted === 0) throw new Error(`Deletion made no progress for ${datasetReleaseId}`)
  }
  throw new Error(`Deletion exceeded the batch budget for ${datasetReleaseId}`)
}

// Each request remains one bounded transaction. Checkpoints replay at most 50
// pages after a hard cancellation; replay is safe because deletion is idempotent.
async function sweepTable(run, { table, functionName, bounds, totals, counters, dryRun, startCursor = null, log = console.log, retry = {}, onPage }) {
  let cursor = startCursor
  let pages = 0
  const limit = adaptiveLimit(bounds)
  const emit = (event, extra = {}) => log(JSON.stringify({ event, table, dryRun, ...totals, pages,
    deleted: totals.blobDeletes ?? totals.deleted ?? totals.storageDeletes ?? 0, cursor, limit: limit.current, ...extra }))
  emit('sweep_progress')
  try {
    for (; pages < 1_000_000;) {
      const result = await withRetry(attempt => run(`maintenance:${functionName}`, {
        ...(DERIVED_TABLES.includes(table) ? { table } : {}), cursor, limit: limit.forAttempt(attempt), dryRun,
      }), { ...retry, log, label: `orphan sweep ${table} cursor ${cursor}` })
      limit.succeeded()
      if (typeof result?.isDone !== 'boolean' || !Number.isSafeInteger(result.scanned) || result.scanned < 0) throw new Error(`Invalid ${table} sweep response`)
      if (!result.isDone && (typeof result.continueCursor !== 'string' || !result.continueCursor || result.continueCursor === cursor)) {
        throw new Error(`${table} sweep did not advance: missing or stalled continuation cursor`)
      }
      pages++
      if ('pages' in totals) totals.pages++
      for (const key of counters) totals[key] += result[key] ?? 0
      onPage?.(result)
      cursor = result.isDone ? null : result.continueCursor
      if (result.isDone) { emit('sweep_done'); return totals }
      if (pages % 50 === 0) emit('sweep_progress')
    }
    throw new Error(`${table} sweep did not terminate`)
  } catch (error) {
    emit('sweep_failed', { error: describeError(error) })
    throw error
  }
}

export async function cleanupOrphanBlobs(run, options = {}) {
  const totals = { scanned: 0, orphans: 0, blobDeletes: 0, chunkDeletes: 0, storageDeletes: 0, oversizedSkipped: 0, pages: 0 }
  return sweepTable(run, { ...options, table: 'manPageContentBlobs', functionName: 'cleanupOrphanContentBlobsBatch',
    bounds: { start: 100, min: 5 }, totals, counters: Object.keys(totals).filter(key => key !== 'pages') })
}

export async function cleanupOrphanManifestFiles(run, options = {}) {
  const { dryRun, log = console.log } = options
  const totals = { scanned: 0, orphans: 0, storageDeletes: 0 }
  let previewed = 0
  await sweepTable(run, { ...options, table: '_storage', functionName: 'cleanupOrphanManifestFilesBatch',
    bounds: { start: 100, min: 5 }, totals, counters: Object.keys(totals), onPage(result) {
      if (dryRun) for (const file of (result.files ?? []).slice(0, 100 - previewed)) {
        log(JSON.stringify({ event: 'manifest_orphan_preview', storageId: file.storageId, ageMs: file.ageMs, size: file.size }))
        previewed++
      }
    } })
  if (dryRun && totals.orphans > previewed) log(JSON.stringify({ event: 'manifest_orphan_preview_truncated', omitted: totals.orphans - previewed, maxFiles: 100 }))
  return totals
}

export async function cleanupOrphanDerivedCaches(run, options = {}) {
  const totals = { scanned: 0, orphans: 0, deleted: 0, unknownSkipped: 0, pages: 0 }
  for (const table of options.table ? [options.table] : DERIVED_TABLES) {
    const result = await sweepTable(run, { ...options, table, functionName: 'cleanupOrphanDerivedCachesBatch',
      bounds: { start: 8, min: 1 }, totals: { scanned: 0, orphans: 0, deleted: 0, unknownSkipped: 0, pages: 0 },
      counters: ['scanned', 'orphans', 'deleted', 'unknownSkipped'] })
    for (const key of Object.keys(totals)) totals[key] += result[key]
  }
  return totals
}

// Bounded concurrency that stops handing out new work after the first failure.
// In-flight workers finish their current item, then the first error is thrown.
export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  let failure = null
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && failure === null) {
      const index = next
      next += 1
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        failure ??= { error }
      }
    }
  })
  await Promise.all(runners)
  if (failure !== null) throw failure.error
  return results
}

export async function prune(run, options, { log = console.log, retry = {} } = {}) {
  const inactive = options.sweepOnly ? [] : await listInactiveReleases(run, retry)
  const selection = selectPrunable(inactive, options)
  const summary = (entries) => entries.map(({ datasetReleaseId, distro, createdAt, ingestedAt, reason, derivedPins }) => ({ datasetReleaseId, distro, createdAt: createdAt ?? ingestedAt, reason, ...(derivedPins ? { derivedPins } : {}) }))
  log(JSON.stringify({
    event: 'prune_plan', apply: options.apply, keepPerDistro: options.keepPerDistro, minAgeHours: options.minAgeMs / 3_600_000,
    sweepOnly: options.sweepOnly, sweep: options.sweep, startCursor: options.startCursor,
    unsealedMinAgeHours: options.unsealedMinAgeMs === null ? null : options.unsealedMinAgeMs / 3_600_000, sweepOrphans: options.sweepOrphans,
    inactive: inactive.length, prune: summary(selection.prune), retained: summary(selection.retained), skipped: summary(selection.skipped),
  }))

  let pruned = []
  const failed = []
  if (options.apply) {
    const results = await mapWithConcurrency(selection.prune, options.concurrency, async (release) => {
      try {
        const result = await pruneRelease(run, release.datasetReleaseId, { log, retry })
        log(JSON.stringify({ event: 'prune_release', ...result }))
        return { release, result }
      } catch (error) {
        if (!isDerivedPinnedError(error)) {
          const failure = { datasetReleaseId: release.datasetReleaseId, error: describeError(error) }
          log(JSON.stringify({ event: 'prune_release_failed', ...failure }))
          return { release, result: null, failure }
        }
        const skipped = { ...release, reason: 'derived dependency pin acquired after preview' }
        log(JSON.stringify({ event: 'prune_skipped', datasetReleaseId: release.datasetReleaseId, reason: skipped.reason }))
        return { release: skipped, result: null }
      }
    })
    for (const entry of results) {
      if (entry.result) pruned.push(entry.result)
      else if (entry.failure) failed.push(entry.failure)
      else selection.skipped.push(entry.release)
    }
    const raced = new Set(results.filter((entry) => !entry.result && !entry.failure).map((entry) => entry.release.datasetReleaseId))
    selection.prune = selection.prune.filter((release) => !raced.has(release.datasetReleaseId))
  }
  // The sweep walks the whole blob table, so it is opt-in for previews.
  const sweepOptions = { dryRun: !options.apply, log, retry, startCursor: options.startCursor }
  const selected = options.sweep ?? 'all'
  const orphans = options.sweepOrphans && ['all', 'blobs'].includes(selected) ? await cleanupOrphanBlobs(run, sweepOptions) : null
  const manifestFiles = options.sweepOrphans && ['all', 'manifests'].includes(selected) ? await cleanupOrphanManifestFiles(run, sweepOptions) : null
  const derivedCaches = options.sweepOrphans && (selected === 'all' || DERIVED_TABLES.includes(selected))
    ? await cleanupOrphanDerivedCaches(run, { ...sweepOptions, ...(selected !== 'all' ? { table: selected } : {}) }) : null
  if (failed.length) throw new Error(`Failed to prune ${failed.length} release(s): ${failed.map(entry => entry.datasetReleaseId).join(', ')}`)
  return { inactive: inactive.length, selection, pruned, orphans, manifestFiles, derivedCaches }
}

// Surface the provider's error text without echoing credentials. Deploy keys
// look like `prod:name|token`; the CLI never prints them, but redact anyway.
export function describeError(error) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : ''
  const lines = stderr.replace(/\[[0-9;]*m/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const detail = lines.length ? lines.slice(-3).join(' | ') : (error?.message ?? String(error))
  const redacted = detail.replace(/\b(prod|dev|preview|project):[A-Za-z0-9_:-]+\|\S+/g, '$1:<redacted>')
  return error?.code !== undefined ? `exit ${error.code}: ${redacted}` : redacted
}

// Same admin endpoint as convex run in the installed SDK; no per-page process.
// The SDK loads lazily so the pure helpers (and ci_contracts' dependency-free
// `pnpm ops:test`) never need node_modules; tests can inject `Client`.
export async function convexRunner(env = process.env, { fetch, Client } = {}) {
  if (!env.CONVEX_DEPLOY_KEY?.trim()) throw new Error('CONVEX_DEPLOY_KEY is required')
  if (!env.CONVEX_URL?.trim()) throw new Error('CONVEX_URL is required (deployment URL)')
  Client ??= (await import('convex/browser')).ConvexHttpClient
  const client = new Client(env.CONVEX_URL, { logger: false, fetch })
  client.setAdminAuth(env.CONVEX_DEPLOY_KEY)
  return (functionName, args) => {
    client.setFetchOptions({ signal: AbortSignal.timeout(120_000) })
    return client.function(functionName, undefined, args)
  }
}

async function main() {
  const options = parseOptions()
  const result = await prune(await convexRunner(), options)
  const deleted = result.pruned.reduce((sum, item) => sum + item.deleted, 0)
  const files = result.pruned.reduce((sum, item) => sum + item.storageDeletes, 0)
  const orphanNote = result.orphans === null ? 'orphan sweep skipped'
    : options.apply ? `removed ${result.orphans.blobDeletes} orphan content blob(s) and ${result.orphans.storageDeletes} stored file(s)`
      : `${result.orphans.orphans} pre-existing orphan content blob(s) found`
  const message = options.apply
    ? `Pruned ${result.pruned.length} inactive release(s) (${deleted} documents, ${files} stored files), retained ${result.selection.retained.length}, skipped ${result.selection.skipped.length}; ${orphanNote}.`
    : `Dry run: ${result.selection.prune.length} inactive release(s) would be pruned, ${result.selection.retained.length} retained, ${result.selection.skipped.length} skipped; ${orphanNote}.`
  const cacheNote = result.derivedCaches === null ? '' : ` Derived caches: ${result.derivedCaches.orphans} orphan(s), ${result.derivedCaches.deleted} removed, ${result.derivedCaches.unknownSkipped} unknown-format key(s) preserved.`
  console.log(message + cacheNote)
  if (result.manifestFiles) console.log(JSON.stringify({ event: 'manifest_orphans', ...result.manifestFiles }))
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}${cacheNote}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Release pruning failed: ${describeError(error)}`)
    process.exitCode = 1
  })
}
