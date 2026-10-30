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
 *  5. three voices: one web font, BM Text, self-hosted from /fonts/bm-text/,
 *     no arbitrary families, and a typed value is always mono;
 *  6. focus stays visible: no outline-none.
 * Utilities are matched with their variants, `!` markers, opacity modifiers
 * and arbitrary values (`border-2`, `bg-accent/50`, `bg-[color:var(--color-accent)]`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['app', 'components', 'pages', 'man-client']
const SOURCE = /\.(tsx|ts)$/
const TEST = /\.(test|spec)\.(tsx|ts)$/

// Things that float above the document may carry an edge, a raised fill and a shadow.
export const OVERLAY_FILES = new Set([
  'components/ui/Dialog.tsx',
  'components/ui/Drawer.tsx',
  'components/ui/Kbd.tsx',
  'components/palette/CommandPalette.tsx',
  'components/shell/AppShell.tsx', // skip link
  'components/man/ManShell.tsx', // skip link
  // The man page script's overlays: the chassis, palette, find bar and keyboard keys.
  'man-client/overlay.ts',
  'man-client/palette.ts',
  'man-client/find.ts',
  'man-client/dom.ts',
  'man-client/composer.ts',
  'man-client/previews.ts',
  'components/explain/DefinitionCard.tsx', // pins over the token grid on phones
])

// BetterMan's own voice: In brief, examples, the addendum. Tinted, never boxed.
export const ADDED_FILES = new Set([
  'components/man/ManPageBrief.tsx',
  'components/man/ManPageFooterSections.tsx',
  'components/explain/ExplainVoice.tsx', // the reading and the safety note
  'components/search/TopHit.tsx', // the top hit's example and key flags
])

// The only red fill: the 2px contents marker beside the active heading.
export const ACCENT_FILL_FILES = new Set(['components/toc/Toc.tsx', 'man-client/toc.ts'])

const RETIRED_TOKENS = ['fg', 'muted', 'faint', 'edge', 'edge-strong', 'code-bg', 'surface', 'accent-subtle', 'accent-edge', 'accent-hover', 'accent-contrast', 'bg']
const RETIRED = new RegExp(`^(text|bg|border(-[trblxy])?|decoration|outline|ring|fill|stroke|divide|from|to|via|placeholder|caret|accent)-(${RETIRED_TOKENS.join('|')})$`)
const LITERAL_COLOR = /(#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\()/i
const COLOR_PREFIX = /^(text|bg|border(-[trblxy])?|decoration|outline|ring|fill|stroke|shadow|from|to|via|placeholder|caret|accent)-\[/

/**
 * A class token split into its variants and its utility, honouring brackets:
 * `md:hover:!bg-[color:var(--x)]/50` → variants ['md', 'hover'], utility
 * 'bg-[color:var(--x)]', modifier '50'.
 */
export function parseToken(raw) {
  const variants = []
  let depth = 0
  let start = 0
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    else if (ch === ':' && depth === 0) {
      variants.push(raw.slice(start, i))
      start = i + 1
    }
  }
  let utility = raw.slice(start).replace(/^!/, '').replace(/!$/, '').replace(/^-/, '')
  let modifier = null
  const slash = topLevelIndex(utility, '/')
  if (slash !== -1) {
    modifier = utility.slice(slash + 1)
    utility = utility.slice(0, slash)
  }
  return { variants, utility, modifier }
}

function topLevelIndex(text, char) {
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    else if (ch === char && depth === 0) return i
  }
  return -1
}

/** Class-like tokens on a line. Quotes, braces and whitespace separate them; brackets do not. */
export function lineTokens(line) {
  return line
    .split(/[\s"'`{}]+/)
    .map((token) => token.replace(/^[(,]+/, '').replace(/[),;]+$/, ''))
    .filter((token) => token && !token.startsWith('//'))
    .map(parseToken)
}

const isZero = (value) => /^0(px|rem|em)?$/.test(value)
const arbitrary = (utility, prefix) => (utility.startsWith(`${prefix}-[`) ? utility.slice(prefix.length + 2, -1) : null)
const isColorValue = (value) => /^(color:|#|rgb|hsl|oklch|oklab|lab|lch|var\(--color)/.test(value)

function isRounded(utility) {
  if (!/^rounded(-|$)/.test(utility) || utility === 'rounded-none') return false
  const value = utility.match(/\[(.*)\]$/)?.[1]
  return !(value && isZero(value))
}

/** A border on every side: `border`, `border-2`, `border-[1.5px]`, but not `border-0` or a colour. */
function isAllSidesBorder(utility) {
  if (utility === 'border') return true
  const width = /^border-(\d+(\.\d+)?)$/.exec(utility)
  if (width) return !isZero(width[1])
  const value = arbitrary(utility, 'border')
  return value !== null && !isColorValue(value) && !isZero(value)
}

function sideBorders(utilities) {
  const has = (side) => utilities.some((u) => new RegExp(`^border-${side}(-\\d+|-\\[[^\\]]+\\])?$`).test(u) && !/-0$/.test(u))
  return (has('x') && has('y')) || ['t', 'r', 'b', 'l'].every(has)
}

/** The colour token a `bg-*` utility paints, through opacity modifiers and arbitrary values. */
function fillToken(utility) {
  if (!utility.startsWith('bg-')) return null
  const value = arbitrary(utility, 'bg')
  if (value === null) return utility.slice(3)
  return /--color-([\w-]+)/.exec(value)?.[1] ?? null
}

function arbitraryProperty(utility) {
  const match = /^\[([\w-]+):(.*)\]$/.exec(utility)
  return match ? { property: match[1], value: match[2] } : null
}

/** Findings for one source file. `file` is relative to nextjs/. */
export function checkSource(file, text) {
  const findings = []
  const fail = (reason, where) => findings.push({ reason, where })

  text.split('\n').forEach((line, idx) => {
    if (/^\s*(\/\/|\/?\*)/.test(line)) return
    const where = `${file}:${idx + 1}: ${line.trim()}`
    const tokens = lineTokens(line)
    const utilities = tokens.map((t) => t.utility)
    const has = (predicate) => utilities.some(predicate)
    const fills = utilities.map(fillToken).filter(Boolean)
    const properties = utilities.map(arbitraryProperty).filter(Boolean)

    if (has(isRounded) || properties.some((p) => p.property === 'border-radius' && !isZero(p.value))) {
      fail('rounded corners are banned (the grammar is square)', where)
    }
    if (!OVERLAY_FILES.has(file)) {
      if (has(isAllSidesBorder) || sideBorders(utilities) || properties.some((p) => p.property === 'border')) {
        fail('enclosing borders belong to overlays; the document uses hairline rules', where)
      }
      if (fills.includes('raised')) fail('raised fills belong to overlays', where)
      if (has((u) => /^(drop-)?shadow(-|$)/.test(u) && u !== 'shadow-none') || properties.some((p) => p.property === 'box-shadow')) {
        fail('shadows belong to overlays', where)
      }
    }
    if (/\bbm-added\b/.test(line) || fills.includes('added')) {
      if (!ADDED_FILES.has(file)) fail("the added tint is BetterMan's voice; add the file to ADDED_FILES deliberately", where)
      if (has(isAllSidesBorder) || sideBorders(utilities)) fail('the added tint is never boxed', where)
    }
    if (fills.includes('accent') && !ACCENT_FILL_FILES.has(file)) {
      fail('the red is for selection, focus and warnings, not fills', where)
    }
    if (has((u) => RETIRED.test(u))) fail('retired colour token (see DESIGN.md tokens)', where)
    if (has((u) => COLOR_PREFIX.test(u) && LITERAL_COLOR.test(u)) || properties.some((p) => LITERAL_COLOR.test(p.value))) {
      fail('arbitrary colours bypass the tokens', where)
    }
    if (has((u) => /^font-\[/.test(u)) || properties.some((p) => p.property === 'font-family')) {
      fail('arbitrary font families bypass the three voices', where)
    }
    // A programmatic focus target (tabIndex -1, like <main>) is not a control.
    if (has((u) => u === 'outline-none' || u === 'outline-hidden' || u === 'outline-0') && !line.includes('tabIndex={-1}')) {
      fail('outline-none hides focus; fields use .bm-field', where)
    }
  })

  // Anything typed is mono. A field may style its placeholder, never its value.
  // JSX inputs self-close, so `/>` ends the element even past an `=> {` handler.
  for (const match of text.matchAll(/<(input)\b[\s\S]*?\/>|<(textarea)\b[\s\S]*?>/g)) {
    const element = match[0]
    const line = text.slice(0, match.index).split('\n').length
    const voiced = element
      .split(/[\s"'`{}]+/)
      .map(parseToken)
      .some((t) => /^font-(serif|sans|\[)/.test(t.utility) && !t.variants.includes('placeholder'))
    if (voiced) fail('typed input is set in mono; only its placeholder may take another voice', `${file}:${line}: <${match[1] ?? match[2]}>`)
  }

  return findings
}

/** Findings for the stylesheet: square, and only BM Text as a web font. */
export function checkCss(file, css) {
  const findings = []
  const fail = (reason, where) => findings.push({ reason, where })
  css.split('\n').forEach((line, idx) => {
    const where = `${file}:${idx + 1}: ${line.trim()}`
    const radius = /border-radius\s*:\s*([^;]+)/.exec(line)
    if (radius && !isZero(radius[1].trim())) fail('rounded corners are banned (the grammar is square)', where)
    const theme = /--radius-[\w-]+\s*:\s*([^;]+)/.exec(line)
    if (theme && !isZero(theme[1].trim())) fail('radius tokens stay 0', where)
  })
  for (const face of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const family = /font-family:\s*"([^"]+)"/.exec(face[1])?.[1]
    const src = /url\("([^"]+)"\)/.exec(face[1])?.[1] ?? ''
    if (family !== 'BM Text' || !src.startsWith('/fonts/bm-text/')) {
      fail('BM Text is the only web font; sans and mono are system faces', `${file}: @font-face ${family ?? '?'} ${src}`)
    }
  }
  return findings
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(rel))
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) out.push(rel)
  }
  return out
}

function main() {
  const findings = [
    ...TARGETS.flatMap(walk).flatMap((file) => checkSource(file, readFileSync(path.join(root, file), 'utf8'))),
    ...checkCss('app/globals.css', readFileSync(path.join(root, 'app/globals.css'), 'utf8')),
  ]
  if (findings.length) {
    const byReason = new Map()
    for (const { reason, where } of findings) byReason.set(reason, [...(byReason.get(reason) ?? []), where])
    for (const [reason, hits] of byReason) {
      console.error(`\n✗ ${reason}:`)
      for (const hit of hits) console.error(`  ${hit}`)
    }
    process.exit(1)
  }
  console.log('✓ visual grammar holds: square, box-free, one red, three voices')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
