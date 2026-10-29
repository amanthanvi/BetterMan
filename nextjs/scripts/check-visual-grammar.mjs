#!/usr/bin/env node
/**
 * Enforces the print-manual grammar recorded in DESIGN.md:
 *  1. square corners: no rounded utilities, no non-zero border-radius;
 *  2. no boxes in the document flow: enclosing borders, raised fills and
 *     shadows belong to floating overlays only;
 *  3. BetterMan's voice is the added tint, only in the components that speak
 *     it, and never boxed;
 *  4. colour comes from the tokens: no arbitrary colours, no retired tokens,
 *     and the red is never a fill except the contents marker;
 *  5. one web font, BM Text, self-hosted from /fonts/bm-text/;
 *  6. focus stays visible: no outline-none.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['app', 'components']
const SOURCE = /\.(tsx|ts)$/
const TEST = /\.(test|spec)\.(tsx|ts)$/

// Things that float above the document may carry an edge, a raised fill and a shadow.
const OVERLAY_FILES = new Set([
  'components/ui/Dialog.tsx',
  'components/ui/Drawer.tsx',
  'components/ui/Kbd.tsx',
  'components/palette/CommandPalette.tsx',
  'components/man/ManPageFindBar.tsx',
  'components/shell/AppShell.tsx', // skip link
])

// BetterMan's own voice: In brief, examples, the addendum. Tinted, never boxed.
const ADDED_FILES = new Set(['components/man/ManPageExamples.tsx', 'components/man/ManPageFooterSections.tsx'])

// The only red fill: the 2px contents marker beside the active heading.
const ACCENT_FILL_FILES = new Set(['components/toc/Toc.tsx'])

const RETIRED_TOKENS = ['fg', 'muted', 'faint', 'edge', 'edge-strong', 'code-bg', 'surface', 'accent-subtle', 'accent-edge', 'accent-hover', 'accent-contrast', 'bg']
const RETIRED = new RegExp(`^(text|bg|border|decoration|outline|ring|fill|stroke|divide|from|to|via)-(${RETIRED_TOKENS.join('|')})(/\\d+)?$`)
const ARBITRARY_COLOR = /^(text|bg|border(-[trblxy])?|decoration|outline|ring|fill|stroke|shadow|from|to|via)-\[(#|rgb|hsl|oklch|oklab|lab|lch|color|var\(--color)/

function walk(dir) {
  const out = []
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(rel))
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) out.push(rel)
  }
  return out
}

/** Class-like tokens on a line, with variants (`hover:`, `md:`) and `!` stripped. */
function utilityTokens(line) {
  return line
    .split(/[\s"'`{}()]+/)
    .map((token) => token.split(':').at(-1)?.replace(/^!/, '').replace(/[),}\];]+$/, ''))
    .filter(Boolean)
}

const failures = new Map()
function fail(reason, where) {
  if (!failures.has(reason)) failures.set(reason, [])
  failures.get(reason).push(where)
}

for (const file of TARGETS.flatMap(walk)) {
  const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\/?\*)/.test(line)) return
    const where = `${file}:${idx + 1}: ${line.trim()}`
    const tokens = new Set(utilityTokens(line))
    const has = (predicate) => [...tokens].some(predicate)

    if (has((t) => t === 'rounded' || (t.startsWith('rounded-') && t !== 'rounded-none'))) {
      fail('rounded corners are banned (the grammar is square)', where)
    }
    if (!OVERLAY_FILES.has(file)) {
      if (tokens.has('border') && has((t) => /^border-(rule|rule-2|ink|ink-2|ink-3|accent)$/.test(t))) {
        fail('enclosing borders belong to overlays; the document uses hairline rules', where)
      }
      if (tokens.has('bg-raised')) fail('raised fills belong to overlays', where)
      if (has((t) => /^shadow-/.test(t) && t !== 'shadow-none')) fail('shadows belong to overlays', where)
    }
    if (/\bbm-added\b|\bbg-added\b/.test(line)) {
      if (!ADDED_FILES.has(file)) fail("the added tint is BetterMan's voice; add the file to ADDED_FILES deliberately", where)
      if (tokens.has('border')) fail('the added tint is never boxed', where)
    }
    if (tokens.has('bg-accent') && !ACCENT_FILL_FILES.has(file)) {
      fail('the red is for selection, focus and warnings, not fills', where)
    }
    if (has((t) => RETIRED.test(t))) fail('retired colour token (see DESIGN.md tokens)', where)
    if (has((t) => ARBITRARY_COLOR.test(t))) fail('arbitrary colours bypass the tokens', where)
    if (has((t) => /^font-\[/.test(t))) fail('arbitrary font families bypass the three voices', where)
    // A programmatic focus target (tabIndex -1, like <main>) is not a control.
    if (tokens.has('outline-none') && !line.includes('tabIndex={-1}')) fail('outline-none hides focus; fields use .bm-field', where)
  })
}

// The stylesheet: square, and only BM Text as a web font.
const cssFile = 'app/globals.css'
const css = readFileSync(path.join(root, cssFile), 'utf8')
css.split('\n').forEach((line, idx) => {
  const where = `${cssFile}:${idx + 1}: ${line.trim()}`
  const radius = /border-radius\s*:\s*([^;]+)/.exec(line)
  if (radius && !/^0(px)?$/.test(radius[1].trim())) fail('rounded corners are banned (the grammar is square)', where)
  const theme = /--radius-[\w-]+\s*:\s*([^;]+)/.exec(line)
  if (theme && !/^0(px)?$/.test(theme[1].trim())) fail('radius tokens stay 0', where)
})
for (const face of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
  const family = /font-family:\s*"([^"]+)"/.exec(face[1])?.[1]
  const src = /url\("([^"]+)"\)/.exec(face[1])?.[1] ?? ''
  if (family !== 'BM Text' || !src.startsWith('/fonts/bm-text/')) {
    fail('BM Text is the only web font; sans and mono are system faces', `${cssFile}: @font-face ${family ?? '?'} ${src}`)
  }
}

if (failures.size) {
  for (const [reason, hits] of failures) {
    console.error(`\n✗ ${reason}:`)
    for (const hit of hits) console.error(`  ${hit}`)
  }
  process.exit(1)
}

console.log('✓ visual grammar holds: square, box-free, one red, three voices')
