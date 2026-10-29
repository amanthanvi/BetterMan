import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i < 0 ? fallback : args[i + 1]
}
const pagesPerDistro = Number(option('--pages-per-distro', '6000'))
const outputArg = option('--output', null)
const binary = resolve(option('--backend', `${process.env.HOME}/.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend`))
assert.equal(process.cwd(), root, 'Run pnpm/Node from this worktree')
assert.equal(Number(process.versions.node.split('.')[0]), 26, 'Use Node26')
assert.ok(Number.isSafeInteger(pagesPerDistro) && pagesPerDistro >= 10, 'Invalid page count')
assert.ok(args.every((arg, i) => i % 2 === 1 || ['--pages-per-distro', '--output', '--backend'].includes(arg)), 'Unknown benchmark argument')
// Every run gets a fresh private directory; an explicit --output must not exist yet.
const output = outputArg === null ? await mkdtemp(resolve(tmpdir(), 'betterman-derived-scale-')) : resolve(outputArg)
if (outputArg !== null) {
  await mkdir(output, { mode: 0o700 }).catch(e => Promise.reject(e.code === 'EEXIST' ? new Error('Benchmark output already exists; choose a fresh --output path') : e))
}
const fixturePath = resolve(root, 'convex/derivedBenchmark.ts')
// The deployed module moves into the output directory afterwards, so cleanup never deletes a concurrent edit.
const deployedFixturePath = resolve(output, 'derivedBenchmark.ts')
const fixture = (await readFile(resolve(root, 'scripts/derived-scale-fixture.ts'), 'utf8')).replaceAll('../convex/', './')
const hash = value => createHash('sha256').update(value).digest('hex')
const fixtureHash = hash(fixture)
const instanceName = `derived-scale-${Date.now()}`
const secret = randomBytes(32).toString('hex')
const configPaths = ['.env.local', 'convex.json', '.convex/local/default/config.json', '.convex/local/default/dashboard.json']
const before = new Map()
for (const name of configPaths) {
  const bytes = await readFile(resolve(root, name)).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))
  before.set(name, bytes)
  if (bytes) await writeFile(resolve(output, `backup-${basename(name)}`), bytes, { mode: 0o600 })
}
let backend, adminKey, url, envCreated = false, fixtureCreated = false, runSucceeded = false
const report = {
  schemaVersion: 1, node: process.version, backend: basename(resolve(binary, '..')),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: {}, pagesPerDistro, distros: ['debian', 'ubuntu', 'fedora', 'freebsd'],
  totalActivePages: pagesPerDistro * 4, runs: [],
  limits: 'Real isolated SQLite-backed Convex on this host; excludes roff rendering, network/WAN, production scheduler load, uploads and ingestion. B1 projection is linear local mutation throughput, not an SLA or invoice.',
}
async function sourceFiles(directory) {
  const names = []
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== '_generated') names.push(...await sourceFiles(name))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) names.push(name)
  }
  return names
}
for (const name of [...await sourceFiles('convex'), 'scripts/derived-scale-fixture.ts', 'scripts/benchmark-derived.mjs']) {
  report.sourceHashes[name] = hash(await readFile(resolve(root, name)))
}
report.backendSha256 = hash(await readFile(binary))
const progress = value => console.log(JSON.stringify(value))
async function freePort(preferred) {
  const server = createServer()
  try {
    server.listen(preferred, '127.0.0.1')
    await once(server, 'listening')
  } catch {
    server.close()
    return freePort(0)
  }
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const childEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER', 'SYSTEMROOT'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
try {
  const cloudPort = await freePort(33210)
  let sitePort = await freePort(33211)
  while (sitePort === cloudPort) sitePort = await freePort(0)
  url = `http://127.0.0.1:${cloudPort}`
  assert.equal(new URL(url).hostname, '127.0.0.1')
  report.localPorts = { cloudPort, sitePort }
  const keygen = spawnSync(binary, ['keygen', 'admin-key', '--instance-name', instanceName, '--instance-secret', secret], { encoding: 'utf8', env: childEnv })
  assert.equal(keygen.status, 0, 'Local key generation failed')
  adminKey = keygen.stdout.trim()
  assert.ok(adminKey.length > 20, 'Local key generation returned no key')
  const logPath = resolve(output, 'backend.log')
  const { open } = await import('node:fs/promises')
  const log = await open(logPath, 'a', 0o600)
  backend = spawn(binary, ['--interface', '127.0.0.1', '--port', String(cloudPort), '--site-proxy-port', String(sitePort), '--instance-name', instanceName, '--instance-secret', secret, '--local-storage', resolve(output, 'storage'), '--disable-beacon', resolve(output, 'backend.sqlite3')], { cwd: root, env: childEnv, stdio: ['ignore', log.fd, log.fd] })
  await log.close()
  report.ownedProcess = { pid: backend.pid, ppid: process.pid, executable: basename(binary) }
  let ready = false
  for (let i = 0; i < 200; i++) {
    if (backend.exitCode !== null) throw new Error('Owned local backend exited during startup')
    try {
      const response = await fetch(`${url}/instance_name`, { signal: AbortSignal.timeout(500) })
      if (response.ok && (await response.text()).trim() === instanceName) { ready = true; break }
    } catch { /* Startup is bounded; no external or other local backend is contacted. */ }
    await delay(100)
  }
  assert.ok(ready, 'Dedicated local backend did not become ready')
  const envPath = resolve(output, 'local.env')
  await writeFile(envPath, `CONVEX_SELF_HOSTED_URL=${url}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`, { mode: 0o600, flag: 'wx' })
  envCreated = true
  await writeFile(fixturePath, fixture, { flag: 'wx' }).catch(e => Promise.reject(e.code === 'EEXIST' ? new Error('Temporary benchmark module already exists; preserve it and choose a clean run') : e))
  fixtureCreated = true
  progress({ phase: 'deploy', localUrl: url, output })
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const deployment = spawnSync(pnpm, ['--use-node-version=26.5.1', 'exec', 'convex', 'deploy', '--yes', '--env-file', envPath, '--codegen', 'disable', '--typecheck', 'disable'], { cwd: root, env: { ...childEnv, CONVEX_AGENT_MODE: 'anonymous' }, encoding: 'utf8', maxBuffer: 5_000_000 })
  // Store only redacted CLI diagnostics; admin credentials never enter public output.
  const cliText = `${deployment.stdout ?? ''}\n${deployment.stderr ?? ''}`.replaceAll(adminKey, '[redacted]').replaceAll(secret, '[redacted]')
  await writeFile(resolve(output, 'deploy.log'), cliText)
  assert.equal(deployment.status, 0, 'Loopback-only local deployment failed; inspect redacted deploy.log')
  await rename(fixturePath, deployedFixturePath)
  fixtureCreated = false
  assert.equal(hash(await readFile(deployedFixturePath)), fixtureHash, 'Benchmark fixture changed concurrently; the deployed copy is in the output directory')
  const client = new ConvexHttpClient(url, { logger: false })
  client.setAdminAuth(adminKey)
  let calls = 0
  const callsByFunction = {}
  const call = async (name, args = {}) => {
    assert.equal(new URL(url).hostname, '127.0.0.1')
    calls++
    callsByFunction[name] = (callsByFunction[name] ?? 0) + 1
    return await client.function(makeFunctionReference(name), undefined, args)
  }
  const baseBody = await call('derivedBenchmark:body', { changed: false })
  const changedBody = await call('derivedBenchmark:body', { changed: true })
  report.storageBodyBytes = { base: baseBody.bytes, changed: changedBody.bytes }
  report.seedQuotaRetries = 0
  async function seedWrite(name, args) {
    for (let attempt = 0; ; attempt++) {
      try { return await call(name, args) } catch (error) {
        if (!String(error).includes('TooManyWrites') || attempt >= 9) throw error
        report.seedQuotaRetries++
        await delay(Math.min(2000, 250 * 2 ** attempt))
      }
    }
  }
  async function seed(distro, version, changedCount = 0) {
    const datasetReleaseId = `synthetic-${distro}-v${version}`
    for (let offset = 0; offset < pagesPerDistro; offset += 100) await seedWrite('derivedBenchmark:seed', {
      datasetReleaseId, distro, offset, count: Math.min(100, pagesPerDistro - offset), total: pagesPerDistro, changedCount, version, baseStorageId: baseBody.storageId, changedStorageId: changedBody.storageId,
    })
    await seedWrite('derivedBenchmark:pointStaging', { datasetReleaseId })
    progress({ phase: 'seed-release', distro, version, pages: pagesPerDistro })
    return datasetReleaseId
  }
  async function status() { return await call('derived:status', {}) }
  async function settle(maxMs = 600_000) {
    const start = performance.now()
    let lastProgress = start
    while (performance.now() - start < maxMs) {
      const state = await status()
      const phase = state.state ?? state.phase ?? state.build?.phase
      const pending = state.pendingJobs ?? state.build?.pendingJobs
      if (performance.now() - lastProgress >= 5000) {
        progress({ phase: 'building', scanned: state.scanned, recomputed: state.recomputed, batches: state.batches, pendingJobs: pending })
        lastProgress = performance.now()
      }
      if (phase === 'complete' || (pending === 0 && phase !== 'blocked')) return state
      if (phase === 'blocked' || phase === 'failed') { await writeFile(resolve(output, 'failed-status.json'), JSON.stringify(state, null, 2)); throw new Error('Synthetic build unexpectedly blocked/failed') }
      if (state.error || state.build?.error) throw new Error('Synthetic build failed; inspect status artifact')
      await delay(100)
    }
    throw new Error('Synthetic build exceeded bounded 10-minute runtime')
  }
  async function measure(name, operation) {
    const before = await call('derivedBenchmark:counters')
    const startCalls = calls, initialCalls = { ...callsByFunction }, started = performance.now()
    await operation()
    const state = await settle()
    const wallSeconds = (performance.now() - started) / 1000
    const after = await call('derivedBenchmark:counters')
    const delta = Object.fromEntries(['scanned', 'recomputed', 'cacheHits', 'skipped', 'batches'].map(key => [key, (state[key] ?? 0) - (before.build?.[key] ?? 0)]))
    const scheduledBefore = Object.values(before.scheduled).reduce((sum, value) => sum + value, 0)
    const scheduledAfter = Object.values(after.scheduled).reduce((sum, value) => sum + value, 0)
    const result = { name, wallSeconds, driverCalls: calls - startCalls, driverCallsByFunction: Object.fromEntries(Object.entries(callsByFunction).map(([key, value]) => [key, value - (initialCalls[key] ?? 0)])),
      delta, scheduledSteps: scheduledAfter - scheduledBefore, activePagesPerSecond: report.totalActivePages / wallSeconds,
      before, after, state }
    report.runs.push(result)
    await writeFile(resolve(output, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`)
    progress({ phase: name, wallSeconds, state })
    return result
  }
  progress({ phase: 'seed', pages: report.totalActivePages })
  const seedStarted = performance.now()
  for (const distro of report.distros) await seed(distro, 1)
  report.seedSeconds = (performance.now() - seedStarted) / 1000
  report.seedQuotaCooldownMs = 1000
  await delay(report.seedQuotaCooldownMs)
  const cold = await measure('cold', () => call('ingest:promoteActiveReleases', { fromStage: 'staging', toStage: 'prod', distros: report.distros, activatedAt: new Date().toISOString() }))
  const unchanged = await measure('unchanged', () => call('derived:rebuildActive', {}))
  await seed('debian', 2, 10)
  await delay(report.seedQuotaCooldownMs)
  const promotion = await measure('one-distro-ten-changes', () => call('ingest:promoteActiveReleases', { fromStage: 'staging', toStage: 'prod', distros: ['debian'], activatedAt: new Date().toISOString() }))
  assert.equal(cold.delta.recomputed, report.totalActivePages, 'Cold build must materialize every active page')
  assert.equal(unchanged.delta.recomputed, 0, 'Unchanged rebuild recomputed rows')
  assert.equal(unchanged.delta.batches, 0, 'Unchanged rebuild scheduled scan batches')
  assert.equal(promotion.delta.recomputed, Math.min(10, pagesPerDistro) * report.distros.length, 'Small promotion recomputed unrelated logical pages')
  assert.ok(report.runs.every(run => run.delta.skipped === 0 && !run.after.scheduledCapped), 'Benchmark skipped data or capped its step inventory')
  report.projection = {
    activePages: 141_000, factor: 141_000 / report.totalActivePages,
    coldLocalSeconds: cold.wallSeconds * 141_000 / report.totalActivePages,
    sameChangedFractionPromotionLocalSeconds: promotion.wallSeconds * 141_000 / report.totalActivePages,
    assumptions: 'Linear local indexed-mutation throughput; same four-distro overlap, eight flags per page, relation density and changed fraction. Excludes production scheduler queue, latency, retries, quota and billing effects.',
  }
  report.driverCalls = calls
  report.driverCallsByFunction = callsByFunction
  for (const [name, expected] of Object.entries(report.sourceHashes)) assert.equal(hash(await readFile(resolve(root, name))), expected, `Measured source changed during run: ${name}`)
  report.sourceHashesUnchanged = true
  runSucceeded = true
  await writeFile(resolve(output, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`)
} catch (error) {
  report.failure = [adminKey, secret].reduce((text, value) => value ? text.replaceAll(value, '[redacted]') : text, String(error))
  throw error
} finally {
  if (fixtureCreated) await rename(fixturePath, deployedFixturePath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    const fields = execFileSync('ps', ['-p', String(backend.pid), '-o', 'ppid=,comm='], { encoding: 'utf8' }).trim().split(/\s+/)
    assert.equal(Number(fields[0]), process.pid, 'Owned backend parent changed; refusing cleanup')
    assert.equal(basename(fields.slice(1).join(' ')), basename(binary), 'Owned backend identity changed; refusing cleanup')
    const exit = once(backend, 'exit')
    backend.kill('SIGTERM')
    await exit
  }
  if (envCreated) await rm(resolve(output, 'local.env'), { force: true })
  for (const [name, bytes] of before) {
    const after = await readFile(resolve(root, name)).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))
    assert.equal(after === null ? null : hash(after), bytes === null ? null : hash(bytes), `${name} changed during dedicated benchmark; original backup retained, no concurrent edit overwritten`)
  }
  report.cleanup = { ownedBackendStopped: true, configurationUnchanged: true, temporaryModuleRemoved: true, credentialsRemoved: true }
  report.completed = runSucceeded
  await writeFile(resolve(output, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`)
  progress({ phase: 'cleanup', ...report.cleanup })
}
