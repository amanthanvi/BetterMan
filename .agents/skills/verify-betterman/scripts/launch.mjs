#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import {
  assertLocalSeedTarget,
  baseUrlParts,
  bashUnsetConvexRemote,
  assertLinuxListenerSupport,
  belongsToRepo,
  checkHealth,
  clearNextFetchCache,
  confirmHydration,
  defaultBaseUrl,
  ensureDirs,
  evidenceDir,
  killTmuxSession,
  listenersOn,
  loadEnvFile,
  unownedListenerAction,
  nodePathExport,
  readState,
  repoRoot,
  restoreGeneratedFiles,
  runCommand,
  sameProcess,
  scrubConvexEnv,
  sessionExists,
  sessions,
  shellQuote,
  snapshotGeneratedFiles,
  startTmuxSession,
  stateDir,
  tcpOpen,
  tmuxAvailable,
  verifyId,
  writeState,
} from './runtime.mjs'

const help = `verify-betterman launch

Start a local BetterMan dev instance when port 3000 is free, seed the E2E
dataset when /api/v1/info is empty, and leave evidence directories in place.

Usage:
  node .agents/skills/verify-betterman/scripts/launch.mjs [--base-url URL]
  pnpm verify:launch

A READY instance is reused only when its pid, start time, and repo match this checkout.
An empty dataset is seeded only when that listener belongs to this repo or this checkout already owns it.
Otherwise launch refuses. Stop that process yourself, then run pnpm verify:launch again.
Cleanup will not stop a server this skill did not start.
Seed runs only when info is 404 or pageCount is 0, and only against a loopback anonymous Convex deployment.
`

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(help)
  process.exit(0)
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function readLog(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  } catch {
    return ''
  }
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await delay(1_000)
  }
  return ''
}

const baseUrl = argValue('--base-url') || defaultBaseUrl
const { port, loopback } = baseUrlParts(baseUrl)
if (!loopback || port !== 3000) {
  process.stderr.write(`launch: refusing ${baseUrl}. This skill owns only http://127.0.0.1:3000\n`)
  process.exit(2)
}

try {
  ensureDirs()
} catch (error) {
  process.stderr.write(`launch: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
snapshotGeneratedFiles()
process.on('exit', () => {
  try {
    restoreGeneratedFiles()
  } catch (error) {
    process.stderr.write(`launch: restore generated files failed: ${error instanceof Error ? error.message : String(error)}\n`)
  }
})

function remember(started, listeners) {
  const previous = readState()
  const merged = new Set([...(previous?.sessions ?? []), ...started])
  writeState({
    baseUrl,
    evidenceDir,
    verifyId,
    sessions: [...merged],
    listeners: { ...(previous?.listeners ?? {}), ...(listeners ?? {}) },
    reused: started.length === 0,
    startedAt: previous?.startedAt || new Date().toISOString(),
  })
}

function ownedNextListener() {
  const recorded = readState()?.listeners?.next
  if (!recorded?.pid) return null
  return listenersOn(port).find((live) => sameProcess(recorded, live)) ?? null
}

function refuseForeign(detail) {
  process.stderr.write(`launch: ${detail} Stop that process yourself, then run pnpm verify:launch again.\n`)
  process.exit(2)
}

function captureNextListener() {
  const match = listenersOn(port).find((live) => belongsToRepo(live) && live.pid && live.startTicks)
  if (!match) return null
  remember(started, {
    next: { pid: match.pid, startTicks: match.startTicks, cwd: match.cwd },
  })
  return match
}

function anonymousDeployment() {
  const deployment = fileEnv.CONVEX_DEPLOYMENT || ''
  return deployment.startsWith('anonymous:') ? deployment : ''
}

function localConvexChildEnv() {
  const env = { ...scrubConvexEnv(), CONVEX_AGENT_MODE: 'anonymous' }
  const deployment = anonymousDeployment()
  if (deployment) env.CONVEX_DEPLOYMENT = deployment
  if (convexUrl) env.CONVEX_URL = convexUrl
  if (convexSite) env.CONVEX_SITE_URL = convexSite
  return env
}

function localConvexShellExports() {
  const lines = ['export CONVEX_AGENT_MODE=anonymous']
  const deployment = anonymousDeployment()
  if (deployment) lines.push(`export CONVEX_DEPLOYMENT=${shellQuote(deployment)}`)
  if (convexUrl) lines.push(`export CONVEX_URL=${shellQuote(convexUrl)}`)
  if (convexSite) lines.push(`export CONVEX_SITE_URL=${shellQuote(convexSite)}`)
  return lines.join('\n')
}

async function waitUntilClosed(timeoutMs) {
  return waitFor(async () => ((await tcpOpen(port, '127.0.0.1')) ? '' : 'closed'), timeoutMs)
}

async function assess(includeHydration) {
  const health = await checkHealth(baseUrl)
  if (!includeHydration || !health.ok) return health
  return confirmHydration(baseUrl, health)
}

try {
  assertLinuxListenerSupport()
} catch (error) {
  process.stderr.write(`launch: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}

const initial = await assess(true)
const previous = readState()
const ownsNext = Boolean(ownedNextListener()) && Array.isArray(previous?.sessions) && previous.sessions.includes(sessions.next)
if (initial.ok) {
  process.stdout.write(`${initial.lines.join('\n')}\n`)
  if (!ownsNext) {
    refuseForeign(
      'doctor is READY, but the listener pid, start time, and repo do not match this checkout. Refusing to reuse it.',
    )
  }
  process.stdout.write('launch: REUSED existing READY instance\n')
  remember([])
  process.exit(0)
}

const listening = await tcpOpen(port)
const repoListener = listening && listenersOn(port).some((live) => belongsToRepo(live))
const unownedAction = listening && !ownsNext ? unownedListenerAction({ code: initial.code, repoListener }) : ''
if (unownedAction === 'refuse-seed' || unownedAction === 'refuse-foreign') {
  process.stdout.write(`${initial.lines.join('\n')}\n`)
  if (unownedAction === 'refuse-seed') {
    refuseForeign('the dataset is empty, but the listener does not belong to this checkout. Refusing to seed it.')
  }
  refuseForeign('port 3000 is already taken by a process this skill did not start. Refusing to start a second server.')
}

if (!tmuxAvailable()) {
  process.stderr.write('launch: tmux is required to keep the dev servers attached to a session this skill can stop\n')
  process.exit(1)
}

if (!existsSync(path.join(repoRoot, 'node_modules')) || !existsSync(path.join(repoRoot, 'nextjs/node_modules'))) {
  process.stdout.write('launch: installing dependencies\n')
  const install = runCommand('pnpm', ['install', '--frozen-lockfile'], { timeoutMs: 300_000 })
  if (install.stdout) process.stdout.write(install.stdout)
  if (install.stderr) process.stderr.write(install.stderr)
  if (install.status !== 0) process.exit(install.status ?? 1)
}

const envFile = path.join(repoRoot, '.env.local')
if (!existsSync(envFile)) {
  process.stdout.write('launch: provisioning local Convex (.env.local)\n')
  const provision = runCommand('pnpm', ['convex:check'], {
    timeoutMs: 180_000,
    env: { ...scrubConvexEnv(), CONVEX_AGENT_MODE: 'anonymous' },
  })
  if (provision.stdout) process.stdout.write(provision.stdout)
  if (provision.stderr) process.stderr.write(provision.stderr)
  if (provision.status !== 0) process.exit(provision.status ?? 1)
}

if (process.env.VERIFY_SKIP_BROWSER_INSTALL !== '1') {
  process.stdout.write('launch: ensuring Playwright Chromium is installed\n')
  const browsers = runCommand('pnpm', ['-C', 'nextjs', 'exec', 'playwright', 'install', 'chromium'], {
    timeoutMs: 300_000,
  })
  if (browsers.status !== 0) {
    process.stderr.write(browsers.stderr || '')
    process.stderr.write('launch: browser install failed. Run: bash scripts/install-playwright-ci.sh\n')
    process.exit(browsers.status ?? 1)
  }
}

const fileEnv = loadEnvFile(envFile)
const convexUrl = fileEnv.CONVEX_URL || fileEnv.VITE_CONVEX_URL || ''
const convexSite = fileEnv.CONVEX_SITE_URL || fileEnv.VITE_CONVEX_SITE_URL || ''
let convexPort = 0
let sitePort = 0
try {
  convexPort = Number(new URL(convexUrl).port || 3210)
  sitePort = Number(new URL(convexSite || convexUrl).port || 3211)
} catch {
  process.stderr.write(`launch: Convex URL in .env.local is not usable (${convexUrl || 'missing'})\n`)
  process.exit(2)
}
try {
  assertLocalSeedTarget({
    deployment: fileEnv.CONVEX_DEPLOYMENT || '',
    backendUrl: convexUrl,
    siteUrl: convexSite,
    deployKey: fileEnv.CONVEX_DEPLOY_KEY || fileEnv.CONVEX_SELF_HOSTED_ADMIN_KEY || '',
  })
} catch (error) {
  process.stderr.write(`launch: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}

const started = []

if (unownedAction === 'seed') {
  const stillOurs = listenersOn(port).some((live) => belongsToRepo(live))
  if (unownedListenerAction({ code: initial.code, repoListener: stillOurs }) !== 'seed') {
    refuseForeign('the dataset is empty, but the listener does not belong to this checkout. Refusing to seed it.')
  }
  if (!(await tcpOpen(convexPort)) || !(await tcpOpen(sitePort))) {
    process.stderr.write(
      'launch: the dataset is empty and Convex is not accepting connections on loopback. Start Convex, then run pnpm verify:launch again.\n',
    )
    process.exit(2)
  }
  seedDataset()
  const seeded = await assess(true)
  process.stdout.write(`${seeded.lines.join('\n')}\n`)
  if (seeded.ok) {
    process.stdout.write('launch: SEEDED existing instance and left its process running\n')
    remember([])
    process.exit(0)
  }
  process.stderr.write(
    'launch: seeded the dataset, but the existing Next process is still not READY. This skill will not restart a server it did not start. Stop that process yourself, then run pnpm verify:launch again.\n',
  )
  process.exit(2)
}

if (!(await tcpOpen(convexPort)) || !(await tcpOpen(sitePort))) {
  if (sessionExists(sessions.convex)) killTmuxSession(sessions.convex)
  process.stdout.write('launch: starting Convex dev session\n')
  const convexScript = `#!/usr/bin/env bash
set -euo pipefail
${nodePathExport()}
cd ${shellQuote(repoRoot)}
${bashUnsetConvexRemote()}
${localConvexShellExports()}
exec npx convex dev --tail-logs disable
`
  startTmuxSession(sessions.convex, convexScript)
  started.push(sessions.convex)
  remember(started)
  const logPath = path.join(stateDir, `${sessions.convex}.log`)
  const ready = await waitFor(() => {
    if (!sessionExists(sessions.convex)) return 'dead'
    return readLog(logPath).includes('Convex functions ready') ? 'ready' : ''
  }, 180_000)
  if (ready !== 'ready') {
    process.stderr.write(`launch: Convex session ${ready === 'dead' ? 'exited' : 'timed out'}. Log: ${logPath}\n`)
    process.stderr.write(readLog(logPath).slice(-4000))
    process.exit(1)
  }
  process.stdout.write('launch: Convex functions ready\n')
}

async function ensureNext(forceRestart = false) {
  const owned = ownedNextListener()
  if (!forceRestart && owned && sessionExists(sessions.next) && (await tcpOpen(port, '127.0.0.1'))) return
  if (sessionExists(sessions.next)) {
    if (!forceRestart && !owned) {
      process.stderr.write('launch: recorded Next session does not match the process listening on 127.0.0.1:3000\n')
      process.exit(2)
    }
    remember(started, { next: null })
    killTmuxSession(sessions.next)
  }
  const closed = await waitUntilClosed(30_000)
  if (closed !== 'closed') {
    process.stderr.write('launch: 127.0.0.1:3000 stayed bound after Next stopped\n')
    process.exit(1)
  }
  clearNextFetchCache()
  process.stdout.write('launch: starting Next.js dev session\n')
  const nextScript = `#!/usr/bin/env bash
set -euo pipefail
${nodePathExport()}
cd ${shellQuote(repoRoot)}
${bashUnsetConvexRemote()}
set -a
. ./.env.local
set +a
${bashUnsetConvexRemote()}
${localConvexShellExports()}
export NEXT_PUBLIC_CONVEX_URL="$CONVEX_URL"
export PUBLIC_BASE_URL=${shellQuote(baseUrl)}
exec pnpm -C nextjs dev --hostname 127.0.0.1 --port 3000
`
  startTmuxSession(sessions.next, nextScript)
  if (!started.includes(sessions.next)) started.push(sessions.next)
  remember(started)
  const up = await waitFor(() => {
    if (!sessionExists(sessions.next)) return 'dead'
    return tcpOpen(port, '127.0.0.1').then((open) => (open ? 'ready' : ''))
  }, 180_000)
  if (up !== 'ready') {
    const logPath = path.join(stateDir, `${sessions.next}.log`)
    process.stderr.write(`launch: Next session ${up === 'dead' ? 'exited' : 'timed out'}. Log: ${logPath}\n`)
    process.stderr.write(readLog(logPath).slice(-4000))
    process.exit(1)
  }
  if (!captureNextListener()) {
    process.stderr.write('launch: 127.0.0.1:3000 is open but no listener belongs to this repo\n')
    process.exit(1)
  }
}

function seedDataset() {
  const siteUrl = convexSite || fileEnv.VITE_CONVEX_SITE_URL || ''
  try {
    assertLocalSeedTarget({
      deployment: fileEnv.CONVEX_DEPLOYMENT || '',
      backendUrl: convexUrl,
      siteUrl,
      deployKey: fileEnv.CONVEX_DEPLOY_KEY || fileEnv.CONVEX_SELF_HOSTED_ADMIN_KEY || '',
    })
  } catch (error) {
    process.stderr.write(`launch: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
  process.stdout.write('launch: seeding empty local dataset\n')
  const convexEnv = localConvexChildEnv()
  const secret = runCommand('npx', ['convex', 'env', 'set', 'CONVEX_INGEST_SECRET', 'dev'], {
    timeoutMs: 120_000,
    env: convexEnv,
  })
  if (secret.stdout) process.stdout.write(secret.stdout)
  if (secret.status !== 0) {
    process.stderr.write(secret.stderr || 'launch: convex env set failed\n')
    process.exit(secret.status ?? 1)
  }
  const seeded = runCommand('node', ['scripts/seed-convex-e2e.mjs'], {
    timeoutMs: 300_000,
    env: {
      ...convexEnv,
      BETTERMAN_E2E_SEED: '1',
      BETTERMAN_DATASET_STAGE: 'prod',
      CONVEX_INGEST_SECRET: 'dev',
      CONVEX_HTTP_URL: siteUrl,
    },
  })
  if (seeded.stdout) process.stdout.write(seeded.stdout)
  if (seeded.status !== 0) {
    process.stderr.write(seeded.stderr || 'launch: seed failed\n')
    process.exit(seeded.status ?? 1)
  }
}

await ensureNext()
remember(started)

let report = await waitForReady()
if (!report.ok && (report.code === 'empty-dataset' || report.code === 'info-stale')) {
  if (report.code === 'empty-dataset') {
    seedDataset()
    process.stdout.write('launch: restarting Next.js so /api/v1/info sees the seeded dataset\n')
  } else {
    process.stdout.write('launch: /api/v1/info is cached with pageCount 0; restarting Next.js after clearing that cache\n')
  }
  report = await waitUntilInfoReady()
}

async function waitForReady() {
  const deadline = Date.now() + 180_000
  let report = await checkHealth(baseUrl)
  while (Date.now() < deadline) {
    if (report.code === 'empty-dataset' || report.code === 'info-stale' || report.code === 'ipv6-only') return report
    if (report.ok) {
      const confirmed = await confirmHydration(baseUrl, report)
      if (confirmed.ok || confirmed.code === 'hydration-unproven') return confirmed
      report = confirmed
    }
    await delay(2_000)
    report = await checkHealth(baseUrl)
  }
  if (report.ok) return confirmHydration(baseUrl, report)
  return report
}

async function waitUntilInfoReady() {
  const deadline = Date.now() + 180_000
  let latest = await checkHealth(baseUrl)
  for (let attempt = 1; attempt <= 3 && Date.now() < deadline; attempt += 1) {
    process.stdout.write('launch: clearing the Next fetch cache and waiting until /api/v1/info pageCount is positive\n')
    await ensureNext(true)
    while (Date.now() < deadline) {
      latest = await checkHealth(baseUrl)
      if (latest.code === 'ipv6-only') return latest
      if (latest.ok) {
        const confirmed = await confirmHydration(baseUrl, latest)
        if (confirmed.ok || confirmed.code === 'hydration-unproven') return confirmed
        if (confirmed.code === 'not-hydrated') {
          latest = confirmed
          await delay(2_000)
          continue
        }
        return confirmed
      }
      if (latest.code === 'info-stale' || latest.code === 'empty-dataset') break
      await delay(2_000)
    }
  }
  return latest
}

process.stdout.write(`${report.lines.join('\n')}\n`)
if (!report.ok) {
  process.stderr.write(`launch: instance is NOT_READY (${report.code}). Logs: ${stateDir}\n`)
  process.exit(2)
}
process.stdout.write(`launch: READY ${baseUrl}\n`)
process.stdout.write(`launch: evidence directory ${evidenceDir}\n`)
