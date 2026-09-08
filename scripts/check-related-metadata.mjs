import { execFile } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export async function waitForRelatedMetadata(readStatus, {
  timeoutMs = 300_000,
  intervalMs = 5_000,
  now = Date.now,
  pause = sleep,
  log = console.log,
} = {}) {
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    const status = await readStatus(Math.min(30_000, deadline - now()))
    if (typeof status?.complete !== 'boolean' || !Array.isArray(status.releases) || status.releases.length > 14) {
      throw new Error('Invalid related metadata status response')
    }
    const pending = status.releases.filter((release) => release?.complete !== true || release.sealed !== true
      || !Number.isSafeInteger(release.currentVersion) || release.currentVersion < 0
      || release.completedVersion !== release.currentVersion)
    log(JSON.stringify(status))
    if (status.complete && status.releases.length > 0 && pending.length === 0 && now() <= deadline) return status
    await pause(Math.min(intervalMs, Math.max(0, deadline - now())))
  }
  throw new Error('Related metadata backfills did not complete within the verification deadline')
}

async function main() {
  if (!process.env.CONVEX_DEPLOY_KEY?.trim()) throw new Error('CONVEX_DEPLOY_KEY is required')
  const status = await waitForRelatedMetadata(async (timeout) => {
    const { stdout } = await exec('pnpm', ['exec', 'convex', 'run', '--prod', 'related:activeMetadataStatus', '{}'], {
      encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
    })
    return JSON.parse(stdout)
  })
  const message = `Verified sealed related metadata completion for ${status.releases.length} active stage/distribution pointers.`
  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Child-process errors may contain provider output; never echo credentials.
    console.error(error.code !== undefined ? `Related metadata check failed (${error.code})` : error.message)
    process.exitCode = 1
  })
}
