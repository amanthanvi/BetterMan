#!/usr/bin/env node
import { existsSync } from 'node:fs'

import { evidenceDir, killTmuxSession, readState, sessionExists, sessions, stateFile, tmuxAvailable, writeState } from './runtime.mjs'

const help = `verify-betterman cleanup

Stop only the Convex and Next sessions this skill started. Evidence stays on disk.

Usage:
  node .agents/skills/verify-betterman/scripts/cleanup.mjs
  pnpm verify:cleanup

State file: ${stateFile}
Evidence:   ${evidenceDir}
`

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(help)
  process.exit(0)
}

const state = readState()
const owned = new Set([sessions.convex, sessions.next])
const started = Array.isArray(state?.sessions) ? state.sessions.filter((name) => owned.has(name)) : []

if (!tmuxAvailable()) {
  if (started.length) {
    process.stderr.write('cleanup: tmux is missing, so owned sessions could not be stopped\n')
    process.exit(1)
  }
} else {
  for (const name of started) {
    if (!sessionExists(name)) {
      process.stdout.write(`cleanup: ${name} already stopped\n`)
      continue
    }
    const stopped = killTmuxSession(name)
    process.stdout.write(`cleanup: ${name} ${stopped ? 'stopped' : 'still-running'}\n`)
  }
}

if (state) {
  writeState({
    ...state,
    sessions: [],
    cleanedAt: new Date().toISOString(),
  })
}

const evidence = state?.evidenceDir || evidenceDir
if (existsSync(evidence)) {
  process.stdout.write(`cleanup: evidence remains at ${evidence}\n`)
} else {
  process.stdout.write(`cleanup: evidence directory is absent (${evidence})\n`)
  process.exit(1)
}
