#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import {
  baseUrlParts,
  checkHealth,
  defaultBaseUrl,
  ensureDirs,
  evidenceDir,
  killTmuxSession,
  loadEnvFile,
  nodePathExport,
  readState,
  repoRoot,
  runCommand,
  sessionExists,
  sessions,
  shellQuote,
  startTmuxSession,
  stateDir,
  tcpOpen,
  tmuxAvailable,
  writeState,
} from './runtime.mjs'

const help = `verify-betterman launch

Start a local BetterMan dev instance when port 3000 is free, seed the E2E
dataset when /api/v1/info is empty, and leave evidence directories in place.

Usage:
  node .agents/skills/verify-betterman/scripts/launch.mjs [--base-url URL]
  pnpm verify:launch

A READY instance is reused. Cleanup will not stop a server this skill did not start.
Seed runs only when info is 404 or pageCount is 0, and only against a loopback Convex URL.
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

ensureDirs()

function remember(started) {
  const previous = readState()
  const merged = new Set([...(previous?.sessions ?? []), ...started])
  writeState({
    baseUrl,
    evidenceDir,
    sessions: [...merged],
    reused: started.length === 0,
    startedAt: previous?.startedAt || new Date().toISOString(),
  })
}

const initial = await checkHealth(baseUrl)
if (initial.ok) {
  process.stdout.write(`${initial.lines.join('\n')}\n`)
  process.stdout.write('launch: REUSED existing READY instance\n')
  remember([])
  process.exit(0)
}

const listening = await tcpOpen(port)
const previous = readState()
const ownsNext = Array.isArray(previous?.sessions) && previous.sessions.includes(sessions.next)
if (listening && !ownsNext && initial.code !== 'empty-dataset') {
  process.stdout.write(`${initial.lines.join('\n')}\n`)
  process.stderr.write(
    'launch: port 3000 is already taken by a process this skill did not start. Refusing to start a second server.\n',
  )
  process.exit(2)
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
    env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
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
if (!convexUrl.startsWith('http://127.0.0.1:') && !convexUrl.startsWith('http://localhost:')) {
  process.stderr.write(`launch: refusing to manage Convex at ${convexUrl}. Expected a loopback URL in .env.local\n`)
  process.exit(2)
}

const started = []

if (initial.code === 'empty-dataset' && listening && !ownsNext) {
  if (!(await tcpOpen(convexPort)) || !(await tcpOpen(sitePort))) {
    process.stderr.write('launch: dataset is empty and Convex is not accepting connections on loopback. Start Convex before seeding a server this skill does not own.\n')
    process.exit(2)
  }
  seedDataset()
  const seeded = await checkHealth(baseUrl)
  process.stdout.write(`${seeded.lines.join('\n')}\n`)
  if (seeded.ok) {
    process.stdout.write('launch: SEEDED existing instance and left its process running\n')
    remember([])
    process.exit(0)
  }
  process.stderr.write(
    'launch: seeded the dataset, but the existing Next process is still not READY. This skill will not restart a server it did not start.\n',
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
export CONVEX_AGENT_MODE=anonymous
exec npx convex dev --tail-logs disable
`
  startTmuxSession(sessions.convex, convexScript)
  started.push(sessions.convex)
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

async function ensureNext() {
  if ((await tcpOpen(port)) && ownsNext && sessionExists(sessions.next)) return
  if (sessionExists(sessions.next)) killTmuxSession(sessions.next)
  process.stdout.write('launch: starting Next.js dev session\n')
  const nextScript = `#!/usr/bin/env bash
set -euo pipefail
${nodePathExport()}
cd ${shellQuote(repoRoot)}
set -a
. ./.env.local
set +a
export CONVEX_URL="\${CONVEX_URL:-\${VITE_CONVEX_URL:-}}"
export NEXT_PUBLIC_CONVEX_URL="$CONVEX_URL"
export CONVEX_AGENT_MODE=anonymous
export PUBLIC_BASE_URL=${shellQuote(baseUrl)}
exec pnpm -C nextjs dev --hostname 127.0.0.1 --port 3000
`
  startTmuxSession(sessions.next, nextScript)
  if (!started.includes(sessions.next)) started.push(sessions.next)
  const up = await waitFor(() => {
    if (!sessionExists(sessions.next)) return 'dead'
    return tcpOpen(port).then((open) => (open ? 'ready' : ''))
  }, 180_000)
  if (up !== 'ready') {
    const logPath = path.join(stateDir, `${sessions.next}.log`)
    process.stderr.write(`launch: Next session ${up === 'dead' ? 'exited' : 'timed out'}. Log: ${logPath}\n`)
    process.stderr.write(readLog(logPath).slice(-4000))
    process.exit(1)
  }
}

function seedDataset() {
  process.stdout.write('launch: seeding empty local dataset\n')
  const secret = runCommand('npx', ['convex', 'env', 'set', 'CONVEX_INGEST_SECRET', 'dev'], {
    timeoutMs: 120_000,
    env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
  })
  if (secret.stdout) process.stdout.write(secret.stdout)
  if (secret.status !== 0) {
    process.stderr.write(secret.stderr || 'launch: convex env set failed\n')
    process.exit(secret.status ?? 1)
  }
  const seeded = runCommand('node', ['scripts/seed-convex-e2e.mjs'], {
    timeoutMs: 300_000,
    env: {
      ...process.env,
      ...fileEnv,
      BETTERMAN_E2E_SEED: '1',
      CONVEX_INGEST_SECRET: 'dev',
      CONVEX_HTTP_URL: convexSite || fileEnv.VITE_CONVEX_SITE_URL || '',
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
if (!report.ok && report.code === 'empty-dataset') {
  seedDataset()
  process.stdout.write('launch: restarting Next.js so the first render sees the seeded dataset\n')
  if (sessionExists(sessions.next)) killTmuxSession(sessions.next)
  await ensureNext()
  remember(started)
  report = await waitForReady()
}

async function waitForReady() {
  const deadline = Date.now() + 180_000
  let report = await checkHealth(baseUrl)
  while (!report.ok && report.code !== 'empty-dataset' && Date.now() < deadline) {
    await delay(2_000)
    report = await checkHealth(baseUrl)
  }
  return report
}

process.stdout.write(`${report.lines.join('\n')}\n`)
if (!report.ok) {
  process.stderr.write(`launch: instance is NOT_READY (${report.code}). Logs: ${stateDir}\n`)
  process.exit(2)
}
process.stdout.write(`launch: READY ${baseUrl}\n`)
process.stdout.write(`launch: evidence directory ${evidenceDir}\n`)
