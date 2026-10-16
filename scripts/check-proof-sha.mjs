#!/usr/bin/env node
// Require a Proof heading in the pull request body to cite the current head
// SHA. Dependabot pull requests are skipped.
//
// The heading text is exactly "Proof" at any ATX level, compared without
// regard to case. The section runs until the next heading of the same or
// higher level outside a fenced code block. Lines inside a fence are literal,
// so a shell comment such as "# results" does not end the section. Nested
// heading lines stay in the section, including a SHA written on that line.
// The citation is the full 40-character head SHA
// (github.event.pull_request.head.sha), matched case-insensitively as its own
// token. A short SHA, or the same digits inside a longer hex string, does not
// count. The SHA must appear in that section, not elsewhere in the body.
//
// A body edit re-runs .github/workflows/pr-proof.yml, so the section can be
// corrected without a new commit.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SHA_RE = /^[0-9a-f]{40}$/i
const DEPENDABOT = 'dependabot[bot]'

function headingMatch(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line)
  if (!match) return null
  const text = match[2].replace(/\s+#+\s*$/, '').trim()
  return { level: match[1].length, text }
}

function openFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  if (!match) return null
  // A backtick fence cannot have a backtick in the info string. That rejects
  // a one-line span such as ```pnpm test```, which is not a fence.
  if (match[1][0] === '`' && match[2].includes('`')) return null
  return { char: match[1][0], length: match[1].length }
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
  if (!match) return false
  return match[1][0] === fence.char && match[1].length >= fence.length
}

export function findProofSection(body) {
  const lines = String(body ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const chunks = []
  let current = null
  let fence = null
  for (const line of lines) {
    if (fence) {
      if (current) current.lines.push(line)
      if (closesFence(line, fence)) fence = null
      continue
    }
    const opened = openFence(line)
    if (opened) {
      fence = opened
      if (current) current.lines.push(line)
      continue
    }
    const heading = headingMatch(line)
    if (heading) {
      if (current && heading.level <= current.level) current = null
      if (current && heading.level > current.level) {
        current.lines.push(line)
        continue
      }
      if (!current && /^proof$/i.test(heading.text)) {
        current = { level: heading.level, lines: [] }
        chunks.push(current)
      }
      continue
    }
    if (current) current.lines.push(line)
  }
  return {
    found: chunks.length > 0,
    text: chunks.map((chunk) => chunk.lines.join('\n')).join('\n'),
  }
}

export function checkProof({ body, sha, author }) {
  if (author === DEPENDABOT) {
    return { ok: true, message: `Skipping Proof check for ${DEPENDABOT}.` }
  }
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    return { ok: false, message: 'Pull request head SHA must be a full 40-character hex digest.' }
  }
  const section = findProofSection(body)
  if (!section.found) {
    return {
      ok: false,
      message:
        'Proof section is missing. Add a markdown heading whose text is Proof and cite the full head SHA ' +
        sha +
        ' in that section.',
    }
  }
  const pattern = new RegExp(`(^|[^0-9a-fA-F])${sha}([^0-9a-fA-F]|$)`, 'i')
  if (!pattern.test(section.text)) {
    return {
      ok: false,
      message: `Proof section does not cite the current head SHA ${sha}.`,
    }
  }
  return { ok: true, message: `Proof section cites the current head SHA ${sha}.` }
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`)
  return value
}

function readBody() {
  const file = argValue('--body-file')
  if (file) return readFileSync(file, 'utf8')
  if (process.argv.includes('--body')) return argValue('--body') ?? ''
  return process.env.PR_BODY ?? ''
}

function main() {
  const result = checkProof({
    body: readBody(),
    sha: argValue('--sha') || process.env.PR_HEAD_SHA || '',
    author: argValue('--author') || process.env.PR_AUTHOR || '',
  })
  const stream = result.ok ? console.log : console.error
  stream(result.message)
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
