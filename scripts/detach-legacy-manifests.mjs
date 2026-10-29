#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { describeError } from './prune-inactive-releases.mjs'

const exec = promisify(execFile)

export async function detachLegacyManifests(run, { apply = false } = {}) {
  let cursor = null
  let eligible = 0
  let batches = 0
  for (; batches < 100_000; batches++) {
    const result = await run('maintenance:detachLegacyManifests', { cursor, dryRun: !apply })
    if (!Number.isSafeInteger(result?.moved) || result.moved < 0 || typeof result.isDone !== 'boolean') throw new Error('Invalid manifest migration response')
    eligible += result.moved
    if (result.isDone) return { apply, eligible, batches: batches + 1 }
    if (!result.continueCursor || result.continueCursor === cursor) throw new Error('Manifest migration did not advance')
    cursor = result.continueCursor
  }
  throw new Error('Manifest migration exceeded batch budget')
}

async function main() {
  const raw = process.env.BETTERMAN_DETACH_MANIFESTS_APPLY ?? 'false'
  if (!['false', 'true'].includes(raw)) throw new Error('BETTERMAN_DETACH_MANIFESTS_APPLY must be true or false')
  const run = async (name, args) => {
    // CLI selection is explicit via the operator's local config or deployment key.
    // No credentials enter argv or output. Dry run is the default on every host.
    const { stdout } = await exec('pnpm', ['exec', 'convex', 'run', name, JSON.stringify(args)], {
      timeout: 120_000, maxBuffer: 1024 * 1024, encoding: 'utf8',
    })
    return JSON.parse(stdout)
  }
  console.log(JSON.stringify(await detachLegacyManifests(run, { apply: raw === 'true' })))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Manifest migration failed: ${describeError(error)}`); process.exitCode = 1 })
}
