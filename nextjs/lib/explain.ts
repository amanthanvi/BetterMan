import type { Explanation } from '../../convex/explain'
import { manPageHref, type Distro } from './distro'

/**
 * Arranges the explain engine's response (docs/explain-contract.md) for the
 * page. Nothing here adds a claim: every label, excerpt, link and fact comes
 * from the engine's tokens, in the order the reader typed them.
 */
export type ExplainToken = Explanation['stages'][number]['tokens'][number]
export type ExplainStage = Explanation['stages'][number]

export type NumberedToken = ExplainToken & { n: number; stage: number; label: string; href: string | null; source: string | null }

/** Tokens that came out of one typed word, such as `-xzvf` or `-C/srv`. */
export type TokenCell = { text: string; tokens: NumberedToken[] }

const CLUSTER_KINDS = new Set<ExplainToken['kind']>(['option', 'optionArgument', 'unknown', 'expansion'])

const KIND_LABELS: Record<ExplainToken['kind'], string> = {
  command: 'command',
  subcommand: 'subcommand',
  option: 'flag',
  optionArgument: 'option argument',
  argument: 'argument',
  assignment: 'assignment',
  operator: 'operator',
  redirect: 'redirect',
  redirectTarget: 'redirect target',
  glob: 'glob',
  expansion: 'expansion',
  comment: 'comment',
  endOfOptions: 'end of options',
  unknown: 'unresolved',
}

function citation(page: { name: string; section: string }) {
  return `${page.name}(${page.section})`
}

/** Every token in input order, numbered from 1, with its label, link and cited source. */
export function numberTokens(explanation: Explanation, urlDistro: Distro | null): NumberedToken[] {
  const all = explanation.stages.flatMap((stage) => stage.tokens.map((token) => ({ token, stage: stage.id })))
  // Stable: tokens sharing a span (`--file=x`) keep the engine's order.
  const ordered = all.map((item, index) => ({ ...item, index })).sort((a, b) => a.token.start - b.token.start || a.index - b.index)
  const out: NumberedToken[] = []
  for (const [i, { token, stage }] of ordered.entries()) {
    let label = KIND_LABELS[token.kind]
    if (token.kind === 'optionArgument') {
      const flag = [...out].reverse().find((prev) => prev.stage === stage && prev.kind === 'option' && prev.anchor === token.anchor)
      if (flag) label = `argument of ${flag.value}`
    }
    let href: string | null = null
    let source: string | null = null
    if (token.page && token.kind !== 'unknown') {
      href = manPageHref(token.page.name, token.page.section, urlDistro, token.anchor ?? undefined)
      source = token.kind === 'option' ? `${citation(token.page)} · ${token.value}` : citation(token.page)
    } else if (token.shell) {
      href = manPageHref(token.shell.page.name, token.shell.page.section, urlDistro, token.shell.anchor ?? undefined)
      source = citation(token.shell.page)
    }
    out.push({ ...token, n: i + 1, stage, label, href, source })
  }
  return out
}

/** Groups the tokens one typed word produced, so a cluster shows once with its flags split beneath it. */
export function tokenCells(tokens: NumberedToken[]): TokenCell[] {
  const cells: TokenCell[] = []
  for (const token of tokens) {
    const last = cells.at(-1)
    const prev = last?.tokens.at(-1)
    const joined =
      prev && prev.stage === token.stage && CLUSTER_KINDS.has(prev.kind) && CLUSTER_KINDS.has(token.kind) &&
      (token.start === prev.end || token.start === prev.start)
    if (last && joined) {
      if (token.start === prev.end) last.text += token.text
      last.tokens.push(token)
    } else {
      cells.push({ text: token.text, tokens: [token] })
    }
  }
  return cells
}

/** One line per resolved command, in input order: the manual's own NAME line. */
export function readingLines(tokens: NumberedToken[]): Array<{ n: number; name: string; section: string; href: string; excerpt: string }> {
  return tokens
    .filter((token) => (token.kind === 'command' || token.kind === 'subcommand') && token.page && token.href)
    .map((token) => ({ n: token.n, name: token.page!.name, section: token.page!.section, href: token.href!, excerpt: token.excerpt }))
}

/** The engine's command-level facts, already deduplicated across the line. */
export function explainFacts(explanation: Explanation): ExplainStage['destructive'] {
  return explanation.stages.flatMap((stage) => stage.destructive)
}

/** Option anchors to look up per manual, for the portability cells. */
export function optionAnchorsByPage(tokens: NumberedToken[]): Array<{ name: string; section: string; anchors: string[] }> {
  const pages = new Map<string, { name: string; section: string; anchors: Set<string> }>()
  for (const token of tokens) {
    if (token.kind !== 'option' || !token.page || !token.anchor) continue
    const key = `${token.page.name}\u0000${token.page.section}`
    const entry = pages.get(key) ?? { name: token.page.name, section: token.page.section, anchors: new Set<string>() }
    entry.anchors.add(token.anchor)
    pages.set(key, entry)
  }
  return [...pages.values()].map((entry) => ({ name: entry.name, section: entry.section, anchors: [...entry.anchors] }))
}

/** Splits a hint such as "Run it with `ls -d` in place of `rm`" into text and code spans, as text. */
export function codeSpans(text: string): Array<{ code: boolean; text: string }> {
  return text.split(/(`[^`]+`)/).filter(Boolean).map((part) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 1 ? { code: true, text: part.slice(1, -1) } : { code: false, text: part },
  )
}

const QUESTION_WORDS = new Set(['how', 'what', 'why', 'where', 'when', 'which', 'who', 'can', 'do', 'does', 'is', 'i', 'use', 'show'])

/** A search query that reads as a command line rather than words: it has a flag or shell syntax. */
export function looksLikeCommandLine(q: string): boolean {
  const words = q.trim().split(/\s+/)
  if (words.length < 2 || !/^[A-Za-z0-9_./+-]+$/.test(words[0]) || words[0].startsWith('-')) return false
  // "how do I use tar -x" is a question about a command, not one to explain.
  if (QUESTION_WORDS.has(words[0].toLowerCase())) return false
  return words.slice(1).some((word) => /^-/.test(word)) || /[|;&<>]/.test(q)
}

/** The id of a token's note in the numbered list; grid links and the card point at it. */
export function noteId(n: number) {
  return `x-${n}`
}
