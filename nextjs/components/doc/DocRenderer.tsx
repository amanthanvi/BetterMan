'use client'

import Link from 'next/link'
import { memo, useEffect, useMemo, type ReactNode } from 'react'

import type { Distro } from '../../lib/distro'
import type { BlockNode, InlineNode } from '../../lib/docModel'
import { scrollToIdWhenRendered } from '../../lib/scroll'
import { escapeRegExp, getRanges, overlapsAny } from '../../lib/textRanges'
import { CodeBlock } from './CodeBlock'

type HighlightCtx = {
  findQuery?: string
  findRegex?: RegExp
  optionRegex?: RegExp
}

// The whole document re-renders on any prop change, so skip the man page's
// unrelated state updates (find keystrokes before the debounce settles, the
// active heading, copy feedback).
export const DocRenderer = memo(function DocRenderer({
  blocks,
  distro,
  findQuery,
  optionTerms,
}: {
  blocks: BlockNode[]
  distro: Distro
  findQuery?: string
  optionTerms?: string[]
}) {
  const find = findQuery?.trim()
  const stableFind = find && find.length >= 2 ? find : undefined
  const optionRegex = useMemo(() => buildOptionRegex(optionTerms), [optionTerms])
  const findRegex = useMemo(() => {
    if (!stableFind) return undefined
    return new RegExp(escapeRegExp(stableFind), 'gi')
  }, [stableFind])

  const ctx = useMemo((): HighlightCtx => ({ findQuery: stableFind, findRegex, optionRegex }), [findRegex, optionRegex, stableFind])

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace(/^#/, '')
      if (!raw) return
      try {
        scrollToIdWhenRendered(decodeURIComponent(raw), { behavior: 'auto', block: 'start' })
      } catch {
        // ignore bad URI sequences
      }
    }

    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="space-y-5">
      {blocks.map((block, idx) => (
        <BlockView key={blockKey(block, idx)} block={block} ctx={ctx} distro={distro} />
      ))}
    </div>
  )
})

function blockKey(block: BlockNode, fallbackIdx: number) {
  if (block.type === 'heading') return `h:${block.id}`
  if (block.type === 'code_block' && block.id) return `code:${block.id}`
  return `${block.type}:${fallbackIdx}`
}

const BlockView = memo(function BlockView({ block, ctx, distro }: { block: BlockNode; ctx: HighlightCtx; distro: Distro }) {
  switch (block.type) {
    case 'heading': {
      const level = clamp(block.level, 2, 6)
      const Tag = (`h${level}` as unknown) as 'h2'

      const base = 'scroll-mt-32 pt-8 first:pt-0 text-fg'
      const headingClass =
        level === 2
          ? 'font-mono text-lg font-semibold tracking-[0.04em] leading-[1.2]'
          : level === 3
            ? 'font-mono text-sm font-semibold tracking-[0.02em] leading-[1.2]'
            : level === 4
              ? 'text-sm font-bold leading-[1.2]'
              : 'text-sm font-semibold leading-[1.2]'

      return (
        <Tag id={block.id} className={`${base} ${headingClass}`} data-level={level}>
          <a
            href={`#${block.id}`}
            className="group inline-flex min-w-0 items-baseline gap-2 text-fg no-underline hover:text-fg"
          >
            <span className="min-w-0 flex-1">{highlightText(block.text, ctx)}</span>
            <span
              aria-hidden="true"
              className="font-mono text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              #
            </span>
          </a>
        </Tag>
      )
    }

    case 'paragraph':
      return <p className="text-fg">{renderInlines(block.inlines, ctx, distro)}</p>

    case 'list': {
      const ListTag = (block.ordered ? 'ol' : 'ul') as 'ol'
      return (
        <ListTag className={`ml-6 space-y-1.5 text-fg ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((itemBlocks, idx) => (
            <li key={idx}>
              <div className="space-y-2">
                {itemBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} distro={distro} />
                ))}
              </div>
            </li>
          ))}
        </ListTag>
      )
    }

    case 'definition_list':
      /* troff .TP: term in a fixed left column, definition flowing beside it;
         stacked with an indent on narrow screens. */
      return (
        <dl className="space-y-3">
          {block.items.map((item, idx) => (
            <div key={item.id ?? idx} className="grid gap-x-6 sm:grid-cols-[minmax(8ch,28ch)_minmax(0,1fr)]">
              <dt id={item.id ?? undefined} className="scroll-mt-32 break-words font-mono text-sm font-semibold text-fg">
                {renderInlines(item.termInlines, ctx, distro)}
              </dt>
              <dd className="mt-1.5 min-w-0 space-y-2 pl-4 text-fg sm:mt-0 sm:pl-0">
                {item.definitionBlocks.map((child, childIdx) => (
                  <BlockView key={blockKey(child, childIdx)} block={child} ctx={ctx} distro={distro} />
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
          languageHint={block.languageHint ?? undefined}
          findQuery={ctx.findQuery}
          optionRegex={ctx.optionRegex}
        />
      )

    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-fg">
            <thead className="text-muted">
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx} className="border-b border-edge-strong pb-2 pl-0 pr-4 font-mono text-xs font-medium tracking-wide">
                    {highlightText(h, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-edge last:border-b-0">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="py-2 pl-0 pr-4 text-sm">
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
      return <hr className="my-6 border-edge" />
  }
})

function renderInlines(inlines: InlineNode[], ctx: HighlightCtx, distro: Distro): ReactNode[] {
  return inlines.map((inline, idx) => {
    switch (inline.type) {
      case 'text':
        return <span key={idx}>{highlightText(inline.text, ctx)}</span>
      case 'code':
        /* Bold mono is the troff convention for "type this literally" — no pill. */
        return (
          <code key={idx} className="font-mono text-[0.95em] font-semibold text-fg">
            {highlightText(inline.text, ctx)}
          </code>
        )
      case 'emphasis':
        return (
          <em key={idx} className="italic">
            {renderInlines(inline.inlines, ctx, distro)}
          </em>
        )
      case 'strong':
        return (
          <strong key={idx} className="font-semibold">
            {renderInlines(inline.inlines, ctx, distro)}
          </strong>
        )
      case 'link':
        if (inline.linkType === 'external') {
          return (
            <a key={idx} href={inline.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-accent-edge">
              <span className="inline-flex items-center gap-1">
                {renderInlines(inline.inlines, ctx, distro)}
                <span aria-hidden="true" className="text-xs text-muted">
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
              className="cursor-not-allowed text-muted underline decoration-edge-strong decoration-dotted underline-offset-4"
              title="Not available in this dataset"
            >
              {renderInlines(inline.inlines, ctx, distro)}
              <span className="sr-only"> (not available)</span>
            </span>
          )
        }
        return (
          <Link key={idx} href={withDistroHref(inline.href, distro)} className="underline underline-offset-4 decoration-accent-edge">
            {renderInlines(inline.inlines, ctx, distro)}
          </Link>
        )
    }
  })
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function buildOptionRegex(terms?: string[]) {
  const cleaned = (terms ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))

  if (!cleaned.length) return undefined

  const body = cleaned.map((t) => escapeRegExp(t)).join('|')
  return new RegExp(body, 'g')
}

function highlightText(text: string, ctx: HighlightCtx) {
  const hasFind = Boolean(ctx.findRegex)
  const hasOpt = Boolean(ctx.optionRegex)
  if (!hasFind && !hasOpt) return text

  const findRanges = hasFind ? getRanges(text, ctx.findRegex!) : []
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
        <mark key={`f:${m.start}`} data-bm-find className="bm-mark bm-find">
          {chunk}
        </mark>,
      )
    } else {
      out.push(
        <mark key={`o:${m.start}`} data-bm-opt className="bm-mark bm-opt">
          {chunk}
        </mark>,
      )
    }
    cursor = m.end
  }

  if (cursor < text.length) out.push(<span key={`t:${cursor}`}>{text.slice(cursor)}</span>)
  return out
}

function withDistroHref(href: string, distro: Distro): string {
  if (!href.startsWith('/')) return href
  if (distro === 'debian') return href

  const url = new URL(href, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}${url.hash}`
}
