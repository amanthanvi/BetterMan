#!/usr/bin/env node
// A recorded baseline must not silently approve its own regression.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const BUDGET_LABEL = 'perf-budget-change'
const BUDGET = 'perf-budgets.json'
const WORKFLOW = '.github/workflows/pr-diff-guards.yml'

export function budgetDiagnostics(before, after) {
  if (!before) return ['initial budget addition']
  if (!after) return ['budget file removed']
  try {
    const left = JSON.parse(before).metrics
    const right = JSON.parse(after).metrics
    if (!left || !right || Array.isArray(left) || Array.isArray(right)) return ['budget metrics are invalid']
    const changes = []
    for (const [metric, previous] of Object.entries(left)) {
      if (!Object.hasOwn(right, metric)) {
        changes.push(`metric removed: ${metric}`)
        continue
      }
      for (const field of ['baseline', 'relative', 'absolute']) {
        const value = right[metric]?.[field]
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          changes.push(`invalid or removed ${field}: ${metric}`)
        } else if (value > previous?.[field]) {
          changes.push(`${field === 'baseline' ? 'baseline raised' : `${field} tolerance widened`}: ${metric} (${previous[field]} -> ${value})`)
        }
      }
      const next = right[metric]
      if (previous?.cap !== undefined && next?.cap === undefined) {
        changes.push(`cap removed: ${metric}`)
      } else if (next?.cap !== undefined) {
        if (typeof next.cap !== 'number' || !Number.isFinite(next.cap) || next.cap < 0) {
          changes.push(`invalid cap: ${metric}`)
        } else if (next.cap > previous?.cap) {
          changes.push(`cap raised: ${metric} (${previous.cap} -> ${next.cap})`)
        }
      }
      if (!previous?.reportOnly && next?.reportOnly === true) {
        changes.push(`hard metric made report-only: ${metric}`)
      }
      // An omitted combine uses sum; max -> sum widens when both margins are positive.
      if (previous?.combine === 'max' && (next?.combine ?? 'sum') === 'sum' &&
        next?.relative > 0 && next?.absolute > 0 &&
        Math.min(next.cap ?? Infinity, next.baseline * (1 + next.relative) + next.absolute) >
        Math.min(next.cap ?? Infinity, Math.max(next.baseline * (1 + next.relative), next.baseline + next.absolute))) {
        changes.push(`combine change widens limit: ${metric} (max -> sum)`)
      }
    }
    return changes
  } catch {
    return ['budget JSON is invalid']
  }
}

export function hasBudgetExplanation(body) {
  // Ignore comments and code fences so templates and quoted examples do not count.
  const lines = String(body ?? '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/)
  let fence = null, inBudget = false
  const sections = []
  let prose = []
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null
      continue
    }
    if (marker) { fence = marker[1]; continue }
    const heading = /^ {0,3}(#{1,6})(?:\s+|$)/.exec(line)
    if (heading && heading[1].length <= 2) {
      if (inBudget) sections.push(prose.join(' '))
      inBudget = line === '## Budget'
      prose = []
    } else if (inBudget && !heading) {
      prose.push(line)
    }
  }
  if (inBudget) sections.push(prose.join(' '))
  return sections.some(text => {
    const words = text.match(/[A-Za-z]+/g) ?? []
    return words.length >= 8 && words.join('').length >= 40 && !/\b(?:TODO|TBD|FIXME)\b/i.test(text)
  })
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function textAt(revision, file) {
  // ls-tree distinguishes an absent path from a failed git show.
  if (!git(['ls-tree', '--name-only', revision, '--', file]).trim()) return ''
  return git(['show', `${revision}:${file}`])
}

export function inspectChanges(base, head) {
  const ancestor = git(['merge-base', base, head]).trim()
  // No rename detection: both the deleted and added path must be protected.
  const paths = git(['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`]).split('\0').filter(Boolean)
  const reasons = paths.filter(file => file === BUDGET || file.startsWith('scripts/perf-') ||
    file === 'scripts/check-perf-budgets.mjs' || file === WORKFLOW ||
    /^scripts\/check-perf-budget-changes(?:\.test)?\.mjs$/.test(file))
  if (paths.includes(BUDGET)) reasons.push(...budgetDiagnostics(textAt(ancestor, BUDGET), textAt(head, BUDGET)))
  if (paths.includes('package.json')) {
    try {
      const read = rev => JSON.parse(textAt(rev, 'package.json') || '{}').scripts?.['perf:check']
      if (read(ancestor) !== read(head)) reasons.push('package.json perf:check script changed')
    } catch {
      reasons.push('package.json cannot be checked for perf:check changes')
    }
  }
  if (paths.includes('.github/workflows/ci.yml')) {
    // Protect the whole job: an unchanged command can still be skipped or made nonblocking.
    // shortcut: uses CI's two-space job keys; update extraction if that convention changes.
    const performanceJob = text => text.split(/^  (?=\S)/m).find(block => block.startsWith('performance_budgets:')) ?? ''
    if (performanceJob(textAt(ancestor, '.github/workflows/ci.yml')) !== performanceJob(textAt(head, '.github/workflows/ci.yml'))) {
      reasons.push('.github/workflows/ci.yml performance_budgets job changed')
    }
    const diff = git(['diff', '-U0', `${base}...${head}`, '--', '.github/workflows/ci.yml'])
    if (diff.split('\n').some(line => /^[+-](?!\+\+|--)/.test(line) && /\bperf:check\b/.test(line))) {
      reasons.push('.github/workflows/ci.yml perf:check invocation changed')
    }
  }
  return reasons
}

export function checkAcknowledgement({ reasons, labels = [], body = '' }) {
  if (!reasons.length) return { ok: true, message: 'No protected performance budget changes.' }
  const missing = []
  if (!labels.includes(BUDGET_LABEL)) missing.push(`exact label ${BUDGET_LABEL}`)
  if (!hasBudgetExplanation(body)) missing.push('exact ## Budget heading with a trade-off explanation (at least 8 words and 40 letters; no TODO/TBD/FIXME)')
  return {
    ok: missing.length === 0,
    message: ['Protected performance budget changes:', ...reasons.map(reason => `  ${reason}`),
      missing.length ? `Required: ${missing.join(' and ')}.` : 'Budget change acknowledged by label and explanation.'].join('\n'),
  }
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
  if (!base) throw new Error('usage: scripts/check-perf-budget-changes.mjs --base <sha> [--head <sha>]')
  const labels = JSON.parse(process.env.PR_LABELS_JSON || '[]') ?? []
  if (!Array.isArray(labels)) throw new Error('PR_LABELS_JSON must be a JSON array of label names')
  const result = checkAcknowledgement({ reasons: inspectChanges(base, head), labels, body: process.env.PR_BODY })
  console.log(result.message)
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
