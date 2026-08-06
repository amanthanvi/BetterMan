#!/usr/bin/env node

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const configPath = new URL('../osv-scanner.toml', import.meta.url)
const packagePath = new URL('../package.json', import.meta.url)

const expectedIds = new Set(['GHSA-fm4j-4xhm-xpwx', 'GHSA-gc25-3vc5-2jf9'])
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

const tomlParser = `
import json
import sys
import tomllib

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
const entries = JSON.parse(
  execFileSync('python3', ['-c', tomlParser, fileURLToPath(configPath)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)

if (entries.length !== expectedIds.size) {
  throw new Error(`Expected exactly ${expectedIds.size} OSV exceptions, found ${entries.length}`)
}

const reviewLeadMs = 30 * 24 * 60 * 60 * 1000
const reviewDeadline = Date.now() + reviewLeadMs
const seen = new Set()

for (const entry of entries) {
  if (!expectedIds.has(entry.id)) throw new Error(`Unexpected OSV exception: ${entry.id}`)
  if (seen.has(entry.id)) throw new Error(`Duplicate OSV exception: ${entry.id}`)
  seen.add(entry.id)

  const expiry = Date.parse(`${entry.ignoreUntil}T00:00:00Z`)
  if (!Number.isFinite(expiry)) throw new Error(`Invalid ignoreUntil for ${entry.id}: ${entry.ignoreUntil}`)
  if (expiry <= reviewDeadline) {
    throw new Error(`${entry.id} expires within 30 days (${entry.ignoreUntil}); re-evaluate the exception`)
  }

  const advisoryUrl = `https://github.com/advisories/${entry.id}`
  if (!entry.reason.includes('sandbox@3.4.0') || !entry.reason.includes(advisoryUrl)) {
    throw new Error(`${entry.id} must retain the package identity and advisory evidence in its reason`)
  }
}

if (packageJson.devDependencies?.vercel !== '58.4.4') {
  throw new Error('Re-evaluate OSV exceptions when the pinned Vercel CLI version changes')
}

const projects = JSON.parse(
  execFileSync(
    'pnpm',
    ['list', 'sandbox', '--recursive', '--depth', 'Infinity', '--lockfile-only', '--json'],
    { encoding: 'utf8' },
  ),
)
const rootProject = projects.find((project) => project.name === packageJson.name)
if (!rootProject) {
  throw new Error(`pnpm list did not return the expected root project: ${packageJson.name}`)
}

const vercelNode = rootProject.devDependencies?.vercel
if (!vercelNode) throw new Error('pnpm list did not return the root Vercel CLI dependency')

const sandboxNode = vercelNode.dependencies?.sandbox
if (!sandboxNode) throw new Error('pnpm list did not return the Vercel CLI -> sandbox dependency edge')

const sandboxOccurrences = []
function collectSandboxOccurrences(value, path = 'projects') {
  if (!value || typeof value !== 'object') return
  if (value.from === 'sandbox') sandboxOccurrences.push({ node: value, path })

  for (const [key, child] of Object.entries(value)) {
    collectSandboxOccurrences(child, `${path}.${key}`)
  }
}
collectSandboxOccurrences(projects)

if (sandboxOccurrences.length !== 1 || sandboxOccurrences[0].node !== sandboxNode) {
  const found = sandboxOccurrences.map(({ node, path }) => `${path}@${node.version ?? 'unknown'}`).join(', ')
  throw new Error(`Expected only the Vercel CLI sandbox@3.4.0 edge; found: ${found || 'none'}`)
}

const sandboxVersion = sandboxNode.version
if (sandboxVersion !== '3.4.0') {
  throw new Error('Expected Vercel CLI 58.4.4 to retain its sandbox@3.4.0 dependency edge')
}

console.log('OSV exception contract passed (2 package-scoped assumptions, >30-day review window).')
