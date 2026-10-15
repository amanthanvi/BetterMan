#!/usr/bin/env node
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  assertLinuxListenerSupport,
  baseUrlParts,
  defaultBaseUrl,
  evidenceDir,
  ensureDirs,
  listenersOn,
  readState,
  repoRoot,
  sameProcess,
  sessions,
  skillDir,
} from './runtime.mjs'

const drive = process.argv.includes('--drive')
const help = `verify-betterman smoke

Run doctor, then one Playwright drive against the already running app.

Usage:
  node .agents/skills/verify-betterman/scripts/smoke.mjs [--base-url URL]
  node .agents/skills/verify-betterman/scripts/smoke.mjs --drive [--base-url URL]
  pnpm verify:smoke
  pnpm verify:drive

--drive walks the feature sweep in scripts/drive.spec.ts.
Without --drive, scripts/smoke.spec.ts opens home, searches tar, and opens tar(1).
After doctor reports READY, smoke refuses unless the listener pid, start time,
and repo match this checkout. Stop that process yourself, then run pnpm verify:launch again.
Extra arguments are forwarded to Playwright, for example:
  pnpm verify:drive -- -g "find in page"

Evidence directory: ${evidenceDir}
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

function playwrightArgs() {
  const extras = []
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--' || arg === '--drive' || arg === '--help' || arg === '-h') continue
    if (arg === '--base-url') {
      index += 1
      continue
    }
    extras.push(arg)
  }
  return extras
}

const baseUrl = argValue('--base-url') || defaultBaseUrl
ensureDirs()

const doctor = spawnSync(process.execPath, [path.join(skillDir, 'scripts/doctor.mjs'), '--base-url', baseUrl], {
  cwd: repoRoot,
  stdio: 'inherit',
})
if (doctor.status !== 0) {
  process.stderr.write(`smoke: doctor exited ${doctor.status ?? 'signal'}; drive skipped\n`)
  process.exit(doctor.status ?? 1)
}

const { port, loopback } = baseUrlParts(baseUrl)
if (!loopback) {
  process.stderr.write(
    `smoke: refusing ${baseUrl}. This skill drives only a loopback server this checkout started. Stop that process yourself, then run pnpm verify:launch again.\n`,
  )
  process.exit(2)
}
try {
  assertLinuxListenerSupport()
} catch (error) {
  process.stderr.write(`smoke: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}
const previous = readState()
const recorded = previous?.listeners?.next
const sessionOwned = Array.isArray(previous?.sessions) && previous.sessions.includes(sessions.next)
const ownsListener = Boolean(recorded?.pid) && sessionOwned && listenersOn(port).some((live) => sameProcess(recorded, live))
if (!ownsListener) {
  process.stderr.write(
    'smoke: the listener pid, start time, and repo do not match this checkout. Refusing to drive it. Stop that process yourself, then run pnpm verify:launch again.\n',
  )
  process.exit(2)
}

const spec = drive ? 'drive.spec.ts' : 'smoke.spec.ts'
const config = path.join(skillDir, 'playwright.config.mjs')
const env = {
  ...process.env,
  E2E_BASE_URL: baseUrl,
  VERIFY_EVIDENCE_DIR: evidenceDir,
  NODE_PATH: [path.join(repoRoot, 'nextjs/node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter),
}

const playwright = spawnSync(
  'pnpm',
  ['-C', 'nextjs', 'exec', 'playwright', 'test', '--config', config, path.join(skillDir, 'scripts', spec), ...playwrightArgs()],
  { cwd: repoRoot, stdio: 'inherit', env },
)

if (playwright.status !== 0) {
  process.stderr.write(`smoke: playwright exited ${playwright.status ?? 'signal'}\n`)
  process.stderr.write(`smoke: evidence remains at ${evidenceDir}\n`)
  process.exit(playwright.status ?? 1)
}

process.stdout.write(`smoke: evidence at ${evidenceDir}\n`)
