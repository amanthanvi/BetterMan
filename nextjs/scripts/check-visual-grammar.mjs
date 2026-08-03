#!/usr/bin/env node
/**
 * Enforces the typeset-manual visual grammar:
 *  1. no rounded corners anywhere,
 *  2. enclosing borders (`border border-edge`) only on floating overlays,
 *  3. surface/raised fills only on floating overlays.
 * Structure comes from typography, whitespace, and hairline rules — not boxes.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['app', 'components']

// Files allowed to carry overlay chrome (single edge + fill): things that
// float above the document.
const OVERLAY_FILES = [
  'components/ui/Dialog.tsx',
  'components/ui/Drawer.tsx',
  'components/ui/Kbd.tsx',
  'components/palette/CommandPalette.tsx',
  'components/man/ManPageFindBar.tsx',
  'components/shell/AppShell.tsx', // skip link + offline banner + sticky header bg-bg
  'components/shell/MobileBottomNav.tsx',
]

function grep(pattern) {
  try {
    const out = execFileSync('grep', ['-rn', '-E', pattern, ...TARGETS, '--include=*.tsx'], {
      cwd: root,
      encoding: 'utf8',
    })
    return out.trim().split('\n').filter(Boolean)
  } catch (err) {
    if (err.status === 1) return [] // no matches
    throw err
  }
}

function disallowed(hits) {
  return hits.filter((line) => {
    const file = line.split(':', 1)[0]
    return !OVERLAY_FILES.includes(file)
  })
}

const failures = []

function utilityTokens(line) {
  const source = line.split(':').slice(2).join(':')
  return source
    .split(/[\s"'`]+/)
    .map((token) => token.split(':').at(-1)?.replace(/^!/, '').replace(/[),}\]]+$/, ''))
    .filter(Boolean)
}

function hasDisallowedRoundedToken(line) {
  return utilityTokens(line).some(
    (utility) => utility === 'rounded' || (utility.startsWith('rounded-') && utility !== 'rounded-none'),
  )
}

function hasEnclosingBorderTokens(line) {
  const tokens = new Set(utilityTokens(line))
  return tokens.has('border') && tokens.has('border-edge')
}

const rounded = grep('rounded').filter(hasDisallowedRoundedToken)
if (rounded.length) failures.push(['rounded corners are banned (typeset grammar is square)', rounded])

const boxes = disallowed(grep('border(-edge)?').filter(hasEnclosingBorderTokens))
if (boxes.length) failures.push(['enclosing borders outside overlay files', boxes])

const fills = disallowed(grep('bg-(surface|raised)'))
if (fills.length) failures.push(['surface/raised fills outside overlay files', fills])

if (failures.length) {
  for (const [reason, hits] of failures) {
    console.error(`\n✗ ${reason}:`)
    for (const hit of hits) console.error(`  ${hit}`)
  }
  process.exit(1)
}

console.log('✓ visual grammar holds: square, box-free, text-first')
