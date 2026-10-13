#!/usr/bin/env node

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const configPath = new URL('../osv-scanner.toml', import.meta.url)
const packagePath = new URL('../package.json', import.meta.url)

// GitHub bounds both advisories to the legacy `sandbox` package below 1.0.0.
// OSV records no fixed event, so osv-scanner flags every version, including
// Vercel's unrelated vercel/sandbox releases that took over the name at 1.0.0.
const exemptPackage = 'sandbox'
const expectedIds = new Set(['GHSA-fm4j-4xhm-xpwx', 'GHSA-gc25-3vc5-2jf9'])
const dayMs = 24 * 60 * 60 * 1000
const reviewLeadMs = 30 * dayMs
const maxHorizonMs = 366 * dayMs

const tomlParser = `
import json
import sys

try:
    import tomllib
except ModuleNotFoundError:
    raise SystemExit(
        "OSV exception parsing requires Python 3.11+ with the tomllib standard library"
    )

with open(sys.argv[1], "rb") as stream:
    config = tomllib.load(stream)

entries = []
for item in config.get("IgnoredVulns", []):
    for field in ("id", "ignoreUntil", "reason"):
        if field not in item:
            raise SystemExit(f"Missing {field} in an [[IgnoredVulns]] entry")
    entries.append({
        "id": str(item["id"]),
        "ignoreUntil": str(item["ignoreUntil"]),
        "reason": str(item["reason"]),
    })

print(json.dumps(entries))
`

function collectOccurrences(value, path) {
  const found = []
  if (!value || typeof value !== 'object') return found
  if (value.from === exemptPackage) found.push({ node: value, path })
  for (const [key, child] of Object.entries(value)) found.push(...collectOccurrences(child, `${path}.${key}`))
  return found
}

// Checks the exceptions against the condition that justifies them, so any
// lockfile change that invalidates them fails here instead of relying on a
// pinned Vercel CLI version to force a manual re-review.
export function checkOsvExceptions(entries, projects, rootName, now = Date.now()) {
  if (entries.length !== expectedIds.size) {
    throw new Error(`Expected exactly ${expectedIds.size} OSV exceptions, found ${entries.length}`)
  }
  const seen = new Set()
  for (const entry of entries) {
    if (!expectedIds.has(entry.id)) throw new Error(`Unexpected OSV exception: ${entry.id}`)
    if (seen.has(entry.id)) throw new Error(`Duplicate OSV exception: ${entry.id}`)
    seen.add(entry.id)

    const expiry = Date.parse(`${entry.ignoreUntil}T00:00:00Z`)
    if (!Number.isFinite(expiry)) throw new Error(`Invalid ignoreUntil for ${entry.id}: ${entry.ignoreUntil}`)
    if (expiry <= now + reviewLeadMs) {
      throw new Error(`${entry.id} expires within 30 days (${entry.ignoreUntil}); re-evaluate the exception`)
    }
    if (expiry > now + maxHorizonMs) {
      throw new Error(`${entry.id} expires more than a year out (${entry.ignoreUntil}); exceptions need yearly review`)
    }

    const advisoryUrl = `https://github.com/advisories/${entry.id}`
    if (!entry.reason.includes('vercel/sandbox') || !entry.reason.includes(advisoryUrl)) {
      throw new Error(`${entry.id} must retain the package identity and advisory evidence in its reason`)
    }
  }

  const rootProject = projects.find((project) => project.name === rootName)
  if (!rootProject) throw new Error(`pnpm list did not return the expected root project: ${rootName}`)

  const occurrences = collectOccurrences(projects, 'projects')
  if (!occurrences.length) {
    throw new Error(`No ${exemptPackage} package remains in the lockfile; remove the stale OSV exceptions`)
  }
  const vercelNode = rootProject.devDependencies?.vercel
  const viaVercel = new Set(collectOccurrences(vercelNode, 'vercel').map(({ node }) => node))
  const versions = new Set()
  for (const { node, path } of occurrences) {
    if (!viaVercel.has(node)) {
      throw new Error(`${exemptPackage} is reachable outside the root Vercel CLI dependency: ${path}`)
    }
    const major = /^(\d+)\.\d+\.\d+$/.exec(node.version ?? '')?.[1]
    if (major === undefined || Number(major) < 1) {
      throw new Error(`${exemptPackage}@${node.version ?? 'unknown'} at ${path} is not a stable release outside the advisories' <1.0.0 range`)
    }
    versions.add(node.version)
  }
  return [...versions]
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const entries = JSON.parse(
    execFileSync('python3', ['-c', tomlParser, fileURLToPath(configPath)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  )
  const projects = JSON.parse(
    execFileSync(
      'pnpm',
      ['list', exemptPackage, '--recursive', '--depth', 'Infinity', '--lockfile-only', '--json'],
      { encoding: 'utf8' },
    ),
  )
  const versions = checkOsvExceptions(entries, projects, packageJson.name)
  const found = versions.map((version) => `${exemptPackage}@${version}`).join(', ')
  console.log(`OSV exception contract passed (${found} via the Vercel CLI is outside the <1.0.0 advisory range; review window 30 days to 1 year).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
