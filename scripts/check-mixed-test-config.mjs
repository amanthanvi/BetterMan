#!/usr/bin/env node
// Fail a pull request that edits test-runner config and application code
// together, unless it carries the label test-config-change.
//
// Test-runner config:
//   vitest.config.*, vitest.workspace.*, playwright.config.*, jest.config.*,
//   jest.setup.*, karma.conf.*, cypress.config.*, pytest.ini, tox.ini,
//   .mocharc.*, conftest.py, a changed [tool.pytest*] or [tool.coverage*]
//   section in pyproject.toml, a changed test script in package.json
//   (test, e2e, ops:test, *:test, *:e2e, test:*), and any changed line in
//   .github/workflows/ci.yml that invokes vitest, playwright, pytest, jest,
//   or a pnpm test script. That includes `pnpm next:e2e` and the CI spelling
//   `pnpm -C nextjs e2e`. The rest of pyproject.toml and package.json is not
//   test-runner config.
// Application code:
//   convex/ outside tests, ingestion/ingestion/, and nextjs/ outside tests,
//   e2e, and markdown. Docs, workflow pin bumps, and test files alone are allowed.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const BYPASS_LABEL = 'test-config-change'
const CI_WORKFLOW = '.github/workflows/ci.yml'
const TEST_SCRIPT =
  /(?:^|\s)pnpm(?:\s+-C\s+\S+)?\s+(?:convex:test|next:test|next:e2e|ingest:test|ops:test|e2e|test)\b/
const TEST_RUNNER = /(?:^|[^A-Za-z0-9_])(?:vitest|playwright|pytest|jest)(?:[^A-Za-z0-9_]|$)/
const TEST_SCRIPT_KEY = /^(?:test|e2e|[\w.:-]*:(?:test|e2e)|test:[\w.:-]+|e2e:[\w.:-]+)$/
const TEST_SECTION = /^\[{1,2}tool\.(?:pytest|coverage)(?:\.|[\]"])/

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
    name === 'conftest.py' ||
    name === '.mocharc' ||
    /^\.mocharc\./.test(name)
  )
}

function sectionHeader(line) {
  const match = /^(\[+\s*[^\]]+\])/.exec(line.trim())
  if (!match) return null
  return match[1].replace(/\s+/g, '')
}

function testToolSections(text) {
  const sections = new Map()
  let name = null
  let lines = []
  const flush = () => {
    if (name && TEST_SECTION.test(name)) sections.set(name, lines.join('\n'))
  }
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const header = sectionHeader(line)
    if (header) {
      flush()
      name = header
      lines = [line]
    } else if (name) {
      lines.push(line)
    }
  }
  flush()
  return sections
}

export function pyprojectTestConfigChanged(before, after) {
  const left = testToolSections(before)
  const right = testToolSections(after)
  const names = new Set([...left.keys(), ...right.keys()])
  for (const name of names) {
    if ((left.get(name) ?? '') !== (right.get(name) ?? '')) return true
  }
  return false
}

function readScripts(text) {
  if (!text || !String(text).trim()) return { ok: true, scripts: {} }
  try {
    const parsed = JSON.parse(text)
    const scripts = parsed && typeof parsed === 'object' ? parsed.scripts : null
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return { ok: true, scripts: {} }
    const out = {}
    for (const [key, value] of Object.entries(scripts)) {
      if (typeof value === 'string') out[key] = value
    }
    return { ok: true, scripts: out }
  } catch {
    return { ok: false, scripts: {} }
  }
}

export function packageJsonTestScriptsChanged(before, after) {
  const left = readScripts(before)
  const right = readScripts(after)
  if (!left.ok || !right.ok) return true
  const keys = new Set([...Object.keys(left.scripts), ...Object.keys(right.scripts)])
  for (const key of keys) {
    if (!TEST_SCRIPT_KEY.test(key)) continue
    if (left.scripts[key] !== right.scripts[key]) return true
  }
  return false
}

export function isTestFile(file) {
  if (file.startsWith('ingestion/tests/')) return true
  if (file.startsWith('nextjs/e2e/')) return true
  if (file.startsWith('scripts/') && (file.endsWith('.test.mjs') || /\/test-[^/]+\.sh$/.test(file))) return true
  return /\.(?:test|spec)\.(?:ts|tsx|js|mjs|py)$/.test(file)
}

export function isDocumentation(file) {
  return file.endsWith('.md') || file.startsWith('docs/')
}

export function isApplicationCode(file) {
  if (isTestRunnerConfig(file) || isTestFile(file) || isDocumentation(file)) return false
  const name = baseName(file)
  if (name === 'package.json' || name === 'pyproject.toml') return false
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

export function evaluateMix({ paths, labels = [], ciWorkflowDiff = '', sectionConfig = [] }) {
  const testConfig = [...new Set([...paths.filter(isTestRunnerConfig), ...sectionConfig])]
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

function changedEntries(base, head) {
  const out = execFileSync('git', ['diff', '--name-status', '-M', `${base}...${head}`], {
    encoding: 'utf8',
  })
  const entries = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const parts = line.split('\t')
    entries.push({ status: parts[0], paths: parts.slice(1) })
  }
  return entries
}

function textAt(rev, file) {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return ''
  }
}

function mergeBase(base, head) {
  return execFileSync('git', ['merge-base', base, head], { encoding: 'utf8' }).trim()
}

function sectionConfigPaths(base, head, entries) {
  const extra = []
  let beforeRev = ''
  for (const entry of entries) {
    const renamed = entry.status.startsWith('R') || entry.status.startsWith('C')
    const beforePath = entry.paths[0]
    const afterPath = renamed ? entry.paths[1] : entry.paths[0]
    const name = baseName(afterPath)
    if (name !== 'pyproject.toml' && name !== 'package.json') continue
    if (!beforeRev) beforeRev = mergeBase(base, head)
    const before = textAt(beforeRev, beforePath)
    const after = textAt(head, afterPath)
    const changed =
      name === 'pyproject.toml'
        ? pyprojectTestConfigChanged(before, after)
        : packageJsonTestScriptsChanged(before, after)
    if (changed) extra.push(afterPath)
  }
  return extra
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
  const entries = changedEntries(base, head)
  const result = evaluateMix({
    paths: entries.flatMap((entry) => entry.paths),
    labels: readLabels(),
    ciWorkflowDiff: ciWorkflowDiff(base, head),
    sectionConfig: sectionConfigPaths(base, head, entries),
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
