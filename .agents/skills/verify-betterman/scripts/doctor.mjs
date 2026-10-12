#!/usr/bin/env node
import { checkHealth, defaultBaseUrl } from './runtime.mjs'

const help = `verify-betterman doctor

Read-only check that a BetterMan instance is worth driving.

Usage:
  node .agents/skills/verify-betterman/scripts/doctor.mjs [--base-url URL] [--json]
  pnpm verify:doctor

Exit 0 when the home page renders the search box, /api/v1/info reports pageCount > 0,
and /api/v1/search?q=tar returns tar(1). Exit 2 when the instance is not worth driving.
The check does not start processes, seed data, or write the dataset.
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
const report = await checkHealth(baseUrl)

if (asJson) {
  process.stdout.write(`${JSON.stringify({ baseUrl, ok: report.ok, code: report.code, lines: report.lines }, null, 2)}\n`)
} else {
  process.stdout.write(`doctor: base ${baseUrl}\n`)
  process.stdout.write(`${report.lines.join('\n')}\n`)
}

process.exit(report.ok ? 0 : 2)
