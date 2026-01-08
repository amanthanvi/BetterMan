import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { BlockNode, InlineNode } from '../api/types'
import { CodeBlock } from './CodeBlock'

type HighlightCtx = {
  findQuery?: string
  optionRegex?: RegExp
}

export function DocRenderer({
  blocks,
  findQuery,
  optionTerms,
}: {
  blocks: BlockNode[]
  findQuery?: string
  optionTerms?: string[]
}) {
  const optionRegex = buildOptionRegex(optionTerms)
  const find = findQuery?.trim()

  const ctx: HighlightCtx = {
    findQuery: find && find.length >= 2 ? find : undefined,
    optionRegex,
  }

  return (
    <div className="space-y-5">
      {blocks.map((block, idx) => (
        <BlockView key={blockKey(block, idx)} block={block} ctx={ctx} />
      ))}
    </div>
  )
}

function blockKey(block: BlockNode, fallbackIdx: number) {
  if (block.type === 'heading') return `h:${block.id}`
  if (block.type === 'code_block' && block.id) return `code:${block.id}`
  return `${block.type}:${fallbackIdx}`
}

function BlockView({ block, ctx }: { block: BlockNode; ctx: HighlightCtx }) {
  switch (block.type) {
    case 'heading': {
      const level = clamp(block.level, 2, 6)
      const Tag = (`h${level}` as unknown) as 'h2'
      return (
        <Tag
          id={block.id}
          className="scroll-mt-32 pt-8 text-[color:var(--bm-fg)] first:pt-0 data-[level=2]:text-2xl data-[level=2]:font-semibold data-[level=2]:tracking-tight data-[level=3]:text-xl data-[level=3]:font-semibold data-[level=3]:tracking-tight data-[level=4]:text-base data-[level=4]:font-semibold"
          data-level={level}
        >
          <a href={`#${block.id}`} className="no-underline hover:underline">
            {highlightText(block.text, ctx)}
          </a>
        </Tag>
      )
    }

    case 'paragraph':
      return (
        <p className="text-[15px] leading-8 text-[color:var(--bm-fg)]">
          {renderInlines(block.inlines, ctx)}
        </p>
      )

    case 'list': {
      const ListTag = (block.ordered ? 'ol' : 'ul') as 'ul'
      return (
        <ListTag
          className={`ml-6 space-y-2 text-[15px] leading-8 text-[color:var(--bm-fg)] ${
            block.ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {block.items.map((itemBlocks, idx) => (
            <li key={idx}>
              <div className="space-y-2">
                {itemBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} />
                ))}
              </div>
            </li>
          ))}
        </ListTag>
      )
    }

    case 'definition_list':
      return (
        <dl className="space-y-4">
          {block.items.map((item, idx) => (
            <div key={item.id ?? idx}>
              <dt
                id={item.id ?? undefined}
                className="scroll-mt-32 font-mono text-sm font-semibold text-[color:var(--bm-fg)]"
              >
                {renderInlines(item.termInlines, ctx)}
              </dt>
              <dd className="mt-2 space-y-2 pl-4 text-[15px] leading-8 text-[color:var(--bm-fg)]">
                {item.definitionBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )

    case 'code_block':
      return (
        <CodeBlock
          id={block.id}
          text={block.text}
          findQuery={ctx.findQuery}
          optionRegex={ctx.optionRegex}
        />
      )

    case 'table':
      return (
        <div className="overflow-x-auto rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65] shadow-sm">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead className="bg-[color:var(--bm-bg)/0.7] text-[color:var(--bm-muted)]">
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx} className="border-b border-[var(--bm-border)] px-3 py-2 font-medium">
                    {highlightText(h, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="odd:bg-[color:var(--bm-bg)/0.35]">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="border-b border-[var(--bm-border)] px-3 py-2">
                      {highlightText(cell, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'horizontal_rule':
      return <hr className="my-6 border-[var(--bm-border)]" />
  }
}

function renderInlines(inlines: InlineNode[], ctx: HighlightCtx) {
  return inlines.map((inline, idx) => {
    switch (inline.type) {
      case 'text':
        return <span key={idx}>{highlightText(inline.text, ctx)}</span>
      case 'code':
        return (
          <code
            key={idx}
            className="rounded bg-[color:var(--bm-bg)/0.8] px-1 py-0.5 font-mono text-[0.95em]"
          >
            {highlightText(inline.text, ctx)}
          </code>
        )
      case 'emphasis':
        return (
          <em key={idx} className="italic">
            {renderInlines(inline.inlines, ctx)}
          </em>
        )
      case 'strong':
        return (
          <strong key={idx} className="font-semibold">
            {renderInlines(inline.inlines, ctx)}
          </strong>
        )
      case 'link':
        if (inline.linkType === 'external') {
          return (
            <a
              key={idx}
              href={inline.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]"
            >
              <span className="inline-flex items-center gap-1">
                {renderInlines(inline.inlines, ctx)}
                <span aria-hidden="true" className="text-xs text-[color:var(--bm-muted)]">
                  ↗
                </span>
              </span>
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )
        }
        if (inline.linkType === 'unresolved') {
          return (
            <span
              key={idx}
              className="cursor-not-allowed text-[color:var(--bm-muted)] underline decoration-dotted decoration-[color:var(--bm-muted)/0.6] underline-offset-4"
              title="Not available in this dataset"
            >
              {renderInlines(inline.inlines, ctx)}
            </span>
          )
        }
        return (
          <Link
            key={idx}
            to={inline.href as never}
            className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]"
          >
            {renderInlines(inline.inlines, ctx)}
          </Link>
        )
    }
  })
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function buildOptionRegex(terms?: string[]) {
  const cleaned = (terms ?? []).map((t) => t.trim()).filter(Boolean)
  if (!cleaned.length) return undefined
  const body = cleaned.map((t) => escapeRegExp(t)).join('|')
  return new RegExp(body, 'g')
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, ctx: HighlightCtx) {
  const hasFind = Boolean(ctx.findQuery)
  const hasOpt = Boolean(ctx.optionRegex)
  if (!hasFind && !hasOpt) return text

  const findRanges = hasFind ? getRanges(text, new RegExp(escapeRegExp(ctx.findQuery!), 'gi')) : []
  const optionRanges = hasOpt ? getRanges(text, ctx.optionRegex!) : []

  const optionFiltered = optionRanges.filter((r) => !overlapsAny(r, findRanges))
  const merged = [...findRanges.map((r) => ({ ...r, kind: 'find' as const })), ...optionFiltered.map((r) => ({ ...r, kind: 'opt' as const }))].sort(
    (a, b) => a.start - b.start,
  )

  if (!merged.length) return text

  const out: Array<ReactNode> = []
  let cursor = 0

  for (const m of merged) {
    if (m.start > cursor) out.push(<span key={`t:${cursor}`}>{text.slice(cursor, m.start)}</span>)
    const chunk = text.slice(m.start, m.end)
    if (m.kind === 'find') {
      out.push(
        <mark
          key={`f:${m.start}`}
          data-bm-find
          className="bm-mark bm-find"
        >
          {chunk}
        </mark>,
      )
    } else {
      out.push(
        <mark
          key={`o:${m.start}`}
          data-bm-opt
          className="bm-mark bm-opt"
        >
          {chunk}
        </mark>,
      )
    }
    cursor = m.end
  }

  if (cursor < text.length) out.push(<span key={`t:${cursor}`}>{text.slice(cursor)}</span>)
  return out
}

function overlapsAny(a: { start: number; end: number }, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((b) => a.start < b.end && b.start < a.end)
}

function getRanges(text: string, regex: RegExp) {
  const ranges: Array<{ start: number; end: number }> = []
  regex.lastIndex = 0
  while (true) {
    const m = regex.exec(text)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (end > start) ranges.push({ start, end })
    if (!m[0].length) regex.lastIndex += 1
  }
  return ranges
}
