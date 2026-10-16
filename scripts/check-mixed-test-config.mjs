#!/usr/bin/env node
// Fail a pull request that edits test-runner config and application code
// together, unless it carries the label test-config-change.
//
// Test-runner config:
//   vitest.config.*, vitest.workspace.*, playwright.config.*, jest.config.*,
//   jest.setup.*, karma.conf.*, cypress.config.*, pytest.ini, tox.ini,
//   .mocharc.*, and any changed line in .github/workflows/ci.yml that invokes
//   vitest, playwright, pytest, jest, or the pnpm test scripts listed below.
// Application code:
//   convex/ outside tests, ingestion/ingestion/, and nextjs/ outside tests
//   and e2e. Docs, workflow pin bumps, and test files alone are allowed.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const BYPASS_LABEL = 'test-config-change'
const CI_WORKFLOW = '.github/workflows/ci.yml'
const TEST_SCRIPT = /(?:^|\s)pnpm(?:\s+-C\s+\S+)?\s+(?:convex:test|next:test|next:e2e|ingest:test|ops:test)\b/
const TEST_RUNNER = /(?:^|[^A-Za-z0-9_])(?:vitest|playwright|pytest|jest)(?:[^A-Za-z0-9_]|$)/

function baseName(file) {
  const parts = file.split('/')
  return parts[parts.length - 1]
}

export function isTestRunnerConfig(file) {
  const name = baseName(file)
  return (
    /^vitest\.config\./.test(name) ||
    /^vitest\.workspace\./.test(name) ||
    /^playwright\.config\./.test(name) ||
    /^jest\.config\./.test(name) ||
    /^jest\.setup\./.test(name) ||
    /^karma\.conf\./.test(name) ||
    /^cypress\.config\./.test(name) ||
    name === 'pytest.ini' ||
    name === 'tox.ini' ||
    name === '.mocharc' ||
    /^\.mocharc\./.test(name)
  )
}

export function isTestFile(file) {
  if (file.startsWith('ingestion/tests/')) return true
  if (file.startsWith('nextjs/e2e/')) return true
  if (file.startsWith('scripts/') && (file.endsWith('.test.mjs') || /\/test-[^/]+\.sh$/.test(file))) return true
  return /\.(?:test|spec)\.(?:ts|tsx|js|mjs|py)$/.test(file)
}

export function isApplicationCode(file) {
  if (isTestRunnerConfig(file) || isTestFile(file)) return false
  if (file.startsWith('convex/')) return true
  if (file.startsWith('ingestion/ingestion/')) return true
  if (file.startsWith('nextjs/')) return true
  return false
}

export function diffTouchesTestRunner(diffText) {
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    const text = line.slice(1)
    if (TEST_SCRIPT.test(text) || TEST_RUNNER.test(text)) return true
  }
  return false
}

export function evaluateMix({ paths, labels = [], ciWorkflowDiff = '' }) {
  const testConfig = [...new Set(paths.filter(isTestRunnerConfig))]
  const application = [...new Set(paths.filter(isApplicationCode))]
  if (diffTouchesTestRunner(ciWorkflowDiff) && !testConfig.includes(CI_WORKFLOW)) {
    testConfig.push(CI_WORKFLOW)
  }
  const mixed = testConfig.length > 0 && application.length > 0
  if (mixed && labels.includes(BYPASS_LABEL)) {
    return { ok: true, bypass: true, testConfig, application }
  }
  if (mixed) return { ok: false, bypass: false, testConfig, application }
  return { ok: true, bypass: false, testConfig, application }
}

export function formatMixResult(result) {
  if (result.ok && result.bypass) {
    return `test-config mix allowed by label ${BYPASS_LABEL}`
  }
  if (result.ok) return 'test-runner config is not mixed with application code'
  const config = result.testConfig.map((file) => `  ${file}`).join('\n')
  const code = result.application.map((file) => `  ${file}`).join('\n')
  return [
    'This pull request edits test-runner config and application code together.',
    'Test-runner config:',
    config,
    'Application code:',
    code,
    `Add the label ${BYPASS_LABEL} only when that mix is intentional, and say why in the pull request body.`,
  ].join('\n')
}

function changedPaths(base, head) {
  const out = execFileSync('git', ['diff', '--name-status', '-M', `${base}...${head}`], {
    encoding: 'utf8',
  })
  const paths = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const parts = line.split('\t')
    paths.push(...parts.slice(1))
  }
  return paths
}

function ciWorkflowDiff(base, head) {
  return execFileSync('git', ['diff', '-U0', `${base}...${head}`, '--', CI_WORKFLOW], {
    encoding: 'utf8',
  })
}

function readLabels() {
  const raw = process.env.PR_LABELS_JSON
  if (!raw || raw === 'null') return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('PR_LABELS_JSON must be a JSON array of label names')
  }
  return parsed.filter((label) => typeof label === 'string')
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${name}`)
  return value
}

function main() {
  const base = argValue('--base') || process.env.PR_BASE_SHA
  const head = argValue('--head') || process.env.PR_HEAD_SHA || 'HEAD'
  if (!base) {
    throw new Error('usage: scripts/check-mixed-test-config.mjs --base <sha> [--head <sha>]')
  }
  const result = evaluateMix({
    paths: changedPaths(base, head),
    labels: readLabels(),
    ciWorkflowDiff: ciWorkflowDiff(base, head),
  })
  console.log(formatMixResult(result))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
