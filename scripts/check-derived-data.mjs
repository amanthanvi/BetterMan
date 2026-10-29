import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

export function checkDerivedStatus(status) {
  if (!status || typeof status.state !== 'string' || typeof status.healthy !== 'boolean') throw new Error('Invalid derived status response')
  const result = Object.fromEntries(['state', 'healthy', 'pendingJobs', 'scanned', 'recomputed', 'cacheHits', 'skipped', 'failedPages', 'batches', 'lastProgressAt', 'error'].filter(key => key in status).map(key => [key, status[key]]))
  if (!status.healthy || status.state !== 'complete' || (status.failedPages ?? status.skipped ?? 0) > 0 || status.error) {
    throw new Error(`Derived data is not healthy: ${JSON.stringify(result)}`)
  }
  return result
}
async function main(args) {
  const file = args.indexOf('--status-file')
  let status
  if (file >= 0 && args[file + 1]) status = JSON.parse(await readFile(args[file + 1], 'utf8'))
  else {
    if (!args.includes('--prod')) throw new Error('Use --prod for an authenticated read-only production check, or --status-file <json>')
    const { stdout } = await promisify(execFile)('pnpm', ['exec', 'convex', 'run', '--prod', 'derived:status', '{}'], { timeout: 30_000, maxBuffer: 1024 * 1024 })
    status = JSON.parse(stdout)
  }
  console.log(JSON.stringify(checkDerivedStatus(status)))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => {
  // CLI errors may contain credentials or provider output; report only our own status diagnostics.
  console.error(error.code !== undefined ? `Derived status check failed (${error.code})` : error.message)
  process.exitCode = 1
})
