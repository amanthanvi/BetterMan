#!/usr/bin/env node

import fs from 'node:fs'

const configPath = new URL('../osv-scanner.toml', import.meta.url)
const lockfilePath = new URL('../pnpm-lock.yaml', import.meta.url)
const packagePath = new URL('../package.json', import.meta.url)

const expectedIds = new Set(['GHSA-fm4j-4xhm-xpwx', 'GHSA-gc25-3vc5-2jf9'])
const config = fs.readFileSync(configPath, 'utf8')
const lockfile = fs.readFileSync(lockfilePath, 'utf8')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

function readField(block, name) {
  const match = block.match(new RegExp(`^${name}\\s*=\\s*(?:"([^"]+)"|([^\\s#]+))\\s*$`, 'm'))
  if (!match) throw new Error(`Missing ${name} in an [[IgnoredVulns]] entry`)
  return match[1] || match[2]
}

const entries = config
  .split('[[IgnoredVulns]]')
  .slice(1)
  .map((block) => ({
    id: readField(block, 'id'),
    ignoreUntil: readField(block, 'ignoreUntil'),
    reason: readField(block, 'reason'),
  }))

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

if (!/^  sandbox@3\.4\.0:\n    resolution:/m.test(lockfile)) {
  throw new Error('Expected the exact sandbox@3.4.0 package record in pnpm-lock.yaml')
}

if (!/^  vercel@58\.4\.4[^\n]*:\n(?: {4,}[^\n]*\n)*?      sandbox: 3\.4\.0$/m.test(lockfile)) {
  throw new Error('Expected Vercel CLI 58.4.4 to retain its sandbox@3.4.0 dependency edge')
}

console.log('OSV exception contract passed (2 package-scoped assumptions, >30-day review window).')
