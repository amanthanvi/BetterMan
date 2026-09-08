import { execFile } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const stages = ['staging', 'prod']
const distros = ['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos']
const expectedPairs = stages.flatMap((stage) => distros.map((distro) => `${stage}/${distro}`))

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
    if (typeof status?.complete !== 'boolean' || !Array.isArray(status.releases) || status.releases.length > expectedPairs.length) {
      throw new Error('Invalid related metadata status response')
    }
    const seen = new Set()
    for (const release of status.releases) {
      if (!stages.includes(release?.stage) || !distros.includes(release?.distro)) {
        throw new Error('Invalid active release stage/distribution pair')
      }
      const pair = `${release.stage}/${release.distro}`
      if (seen.has(pair)) throw new Error(`Duplicate active release pointer: ${pair}`)
      seen.add(pair)
      if (release.manifestError !== null) {
        if (typeof release.manifestError !== 'string' || !release.manifestError.trim()) {
          throw new Error(`Invalid manifest error for ${pair}`)
        }
        throw new Error(`Manifest verification failed for ${pair}: ${release.manifestError}`)
      }
    }
    const missing = expectedPairs.filter((pair) => !seen.has(pair))
    if (missing.length) throw new Error(`Missing active release pointers: ${missing.join(', ')}`)
    const pending = status.releases.filter((release) => release?.complete !== true || release.sealed !== true
      || release.manifestVerified !== true
      || !Number.isSafeInteger(release.currentVersion) || release.currentVersion < 0
      || release.completedVersion !== release.currentVersion)
    log(JSON.stringify(status))
    if (status.complete && pending.length === 0 && now() <= deadline) return status
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
  const message = `Verified upload manifests and sealed related metadata completion for ${status.releases.length} active stage/distribution pointers.`
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
