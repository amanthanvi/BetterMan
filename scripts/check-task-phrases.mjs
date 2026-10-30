import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const STATES = new Set(['complete', 'running', 'failed', 'missing'])

/**
 * Task-phrase search rows (convex/taskPhrases.ts) are backfilled per active
 * release after each deploy, asynchronously. Complete only when every active
 * release is; a failed batch names its release. Prints allowlisted fields only.
 */
export function checkTaskPhraseStatus(status) {
  if (!status || typeof status.complete !== 'boolean' || !Number.isSafeInteger(status.version) || !Array.isArray(status.releases)) {
    throw new Error('Invalid task phrase status response')
  }
  const releases = status.releases.map((release) => {
    if (!STATES.has(release?.state) || typeof release.datasetReleaseId !== 'string') throw new Error('Invalid task phrase release status')
    return Object.fromEntries(['stage', 'distro', 'datasetReleaseId', 'state', 'scanned', 'written', 'attempts', 'updatedAt'].map((key) => [key, release[key]]))
  })
  const result = { complete: status.complete, version: status.version, releases }
  const failed = releases.filter((release) => release.state === 'failed')
  if (failed.length) {
    throw new Error(`TASK_PHRASE_BACKFILL_FAILED for ${failed.map((release) => `${release.stage}/${release.distro} (${release.datasetReleaseId})`).join(', ')}: rerun taskPhrases:backfillActiveReleases to resume from the saved cursor. ${JSON.stringify(result)}`)
  }
  if (!status.complete || releases.some((release) => release.state !== 'complete')) {
    throw new Error(`Task phrase backfill is not complete: ${JSON.stringify(result)}`)
  }
  return result
}

async function main(args) {
  const file = args.indexOf('--status-file')
  let status
  if (file >= 0 && args[file + 1]) status = JSON.parse(await readFile(args[file + 1], 'utf8'))
  else {
    if (!args.includes('--prod')) throw new Error('Use --prod for an authenticated read-only production check, or --status-file <json>')
    const { stdout } = await promisify(execFile)('pnpm', ['exec', 'convex', 'run', '--prod', 'taskPhrases:status', '{}'], { timeout: 30_000, maxBuffer: 1024 * 1024 })
    status = JSON.parse(stdout)
  }
  console.log(JSON.stringify(checkTaskPhraseStatus(status)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((error) => {
  // CLI errors may contain credentials or provider output; report only our own status diagnostics.
  console.error(error.code !== undefined ? `Task phrase status check failed (${error.code})` : error.message)
  process.exitCode = 1
})
