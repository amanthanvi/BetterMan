#!/usr/bin/env node
import { assertLinuxListenerSupport, baseUrlParts, checkHealth, confirmHydration, defaultBaseUrl } from './runtime.mjs'

const help = `verify-betterman doctor

Check that a BetterMan instance is worth driving.

Usage:
  node .agents/skills/verify-betterman/scripts/doctor.mjs [--base-url URL] [--json]
  pnpm verify:doctor

Exit 0 when all of the following are true:
- GET / renders the search box and GET /api/v1/search?q=tar returns tar(1)
- GET /api/v1/info reports pageCount greater than 0
- port 3000 has an IPv4 listen socket, and TCP to 127.0.0.1 succeeds
- Chromium can see React props on Cycle theme and a click writes bm-theme

Exit 2 when the instance is not worth driving. A loopback URL also exits 2 when /proc is unavailable (Linux-only).
A URL that is not loopback skips that listener check. The check does not start processes,
seed data, or write the dataset. The hydration click runs in a throwaway browser.
`

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(help)
  process.exit(0)
}

const baseUrl = argValue('--base-url') || defaultBaseUrl
const asJson = process.argv.includes('--json')
if (baseUrlParts(baseUrl).loopback) {
  try {
    assertLinuxListenerSupport()
  } catch (error) {
    process.stderr.write(`doctor: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
}
const report = await confirmHydration(baseUrl, await checkHealth(baseUrl))

if (asJson) {
  process.stdout.write(`${JSON.stringify({ baseUrl, ok: report.ok, code: report.code, lines: report.lines }, null, 2)}\n`)
} else {
  process.stdout.write(`doctor: base ${baseUrl}\n`)
  process.stdout.write(`${report.lines.join('\n')}\n`)
}

process.exit(report.ok ? 0 : 2)
