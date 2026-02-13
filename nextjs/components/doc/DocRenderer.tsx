'use client'

import { useWindowVirtualizer } from '@tanstack/react-virtual'
import Link from 'next/link'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Distro } from '../../lib/distro'
import type { BlockNode, InlineNode } from '../../lib/docModel'
import { escapeRegExp, getRanges, overlapsAny } from '../../lib/textRanges'
import { CodeBlock } from './CodeBlock'

type BmScrollBehavior = 'auto' | 'smooth'

export type DocRendererHandle = {
  isVirtualized: boolean
  scrollToBlockIndex: (index: number, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => void
  scrollToAnchor: (id: string, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => void
}

type HighlightCtx = {
  findQuery?: string
  findRegex?: RegExp
  optionRegex?: RegExp
}

export const DocRenderer = forwardRef<
  DocRendererHandle,
  {
    blocks: BlockNode[]
    distro: Distro
    findQuery?: string
    optionTerms?: string[]
    onActiveHeadingChange?: (id: string | null) => void
  }
>(function DocRenderer({ blocks, distro, findQuery, optionTerms, onActiveHeadingChange }, ref) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const find = findQuery?.trim()
  const stableFind = find && find.length >= 2 ? find : undefined
  const optionRegex = useMemo(() => buildOptionRegex(optionTerms), [optionTerms])
  const findRegex = useMemo(() => {
    if (!stableFind) return undefined
    return new RegExp(escapeRegExp(stableFind), 'gi')
  }, [stableFind])

  const ctx = useMemo((): HighlightCtx => ({ findQuery: stableFind, findRegex, optionRegex }), [findRegex, optionRegex, stableFind])

  const shouldVirtualize = blocks.length >= 100
  const isVirtualized = mounted && shouldVirtualize

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setScrollMargin(el.offsetTop)
  }, [blocks.length])

  const anchorToBlockIndex = useMemo(() => buildAnchorIndex(blocks), [blocks])
  const headings = useMemo(() => {
    return blocks.flatMap((b, idx) => (b.type === 'heading' ? [{ id: b.id, index: idx }] : []))
  }, [blocks])

  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: blocks.length,
    enabled: isVirtualized,
    estimateSize: (idx) => estimateBlockSize(blocks[idx]),
    overscan: 6,
    gap: 20,
    scrollMargin,
    scrollPaddingStart: 140,
    getItemKey: (idx) => blockKey(blocks[idx], idx),
  })

  const fineTuneScrollToId = useCallback((id: string, opts: { behavior: BmScrollBehavior; block: ScrollLogicalPosition }) => {
    let attempts = 0

    const tick = () => {
      attempts += 1
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: opts.behavior, block: opts.block })
        return
      }
      if (attempts < 20) window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  }, [])

  const scrollToBlockIndex = useCallback(
    (index: number, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => {
      if (!isVirtualized) return

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const behavior = opts?.behavior ?? (reduced ? 'auto' : 'smooth')
      const align = opts?.align ?? 'start'

      virtualizer.scrollToIndex(index, {
        align: align === 'center' ? 'center' : 'start',
        behavior,
      })
    },
    [isVirtualized, virtualizer],
  )

  const scrollToAnchor = useCallback(
    (id: string, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const behavior = opts?.behavior ?? (reduced ? 'auto' : 'smooth')
      const align = opts?.align ?? 'start'
      const block = align === 'center' ? 'center' : 'start'

      const idx = anchorToBlockIndex.get(id)
      if (idx != null && isVirtualized) {
        virtualizer.scrollToIndex(idx, {
          align: align === 'center' ? 'center' : 'start',
          behavior,
        })
      }

      fineTuneScrollToId(id, { behavior, block })
    },
    [anchorToBlockIndex, fineTuneScrollToId, isVirtualized, virtualizer],
  )

  useImperativeHandle(
    ref,
    () => ({ isVirtualized, scrollToBlockIndex, scrollToAnchor }),
    [isVirtualized, scrollToAnchor, scrollToBlockIndex],
  )

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace(/^#/, '')
      if (!raw) return
      try {
        scrollToAnchor(decodeURIComponent(raw), { behavior: 'auto' })
      } catch {
        // ignore bad URI sequences
      }
    }

    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [scrollToAnchor])

  useEffect(() => {
    if (!isVirtualized || !onActiveHeadingChange || !headings.length) return

    const activeRef = { id: null as string | null }
    let raf = 0

    const update = () => {
      raf = 0

      const item = virtualizer.getVirtualItemForOffset(window.scrollY + 180)
      const index = item?.index ?? 0
      const nextId = findActiveHeadingId(headings, index)

      if (nextId !== activeRef.id) {
        activeRef.id = nextId
        onActiveHeadingChange(nextId)
      }
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [headings, isVirtualized, onActiveHeadingChange, virtualizer])

  if (!isVirtualized) {
    return (
      <div ref={containerRef} className="space-y-5">
        {blocks.map((block, idx) => (
          <BlockView key={blockKey(block, idx)} block={block} ctx={ctx} distro={distro} />
        ))}
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()
  const total = virtualizer.getTotalSize()

  return (
    <div ref={containerRef}>
      <div className="relative w-full" style={{ height: total }}>
        {items.map((v) => (
          <div
            key={v.key}
            ref={virtualizer.measureElement}
            data-index={v.index}
            data-bm-block-index={v.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${v.start - scrollMargin}px)` }}
          >
            <BlockView block={blocks[v.index]} ctx={ctx} distro={distro} />
          </div>
        ))}
      </div>
    </div>
  )
})

function blockKey(block: BlockNode, fallbackIdx: number) {
  if (block.type === 'heading') return `h:${block.id}`
  if (block.type === 'code_block' && block.id) return `code:${block.id}`
  return `${block.type}:${fallbackIdx}`
}

function BlockView({ block, ctx, distro }: { block: BlockNode; ctx: HighlightCtx; distro: Distro }) {
  switch (block.type) {
    case 'heading': {
      const level = clamp(block.level, 2, 6)
      const Tag = (`h${level}` as unknown) as 'h2'

      const base = 'scroll-mt-32 pt-8 first:pt-0 text-[color:var(--bm-fg)]'
      const headingClass =
        level === 2
          ? 'border-l-[3px] border-[var(--bm-accent)] pl-3 text-[20px] font-semibold tracking-tight leading-[1.2]'
          : level === 3
            ? 'text-[16px] font-semibold tracking-tight leading-[1.2]'
            : level === 4
              ? 'text-[14px] font-bold leading-[1.2]'
              : 'text-[13px] font-semibold leading-[1.2]'

      return (
        <Tag id={block.id} className={`${base} ${headingClass}`} data-level={level}>
          <a href={`#${block.id}`} className="group inline-flex min-w-0 items-baseline gap-2 no-underline">
            <span className="min-w-0 flex-1">{highlightText(block.text, ctx)}</span>
            <span
              aria-hidden="true"
              className="font-mono text-xs text-[color:var(--bm-muted)] opacity-0 transition-opacity group-hover:opacity-100"
            >
              #
            </span>
          </a>
        </Tag>
      )
    }

    case 'paragraph':
      return <p className="text-[color:var(--bm-fg)]">{renderInlines(block.inlines, ctx, distro)}</p>

    case 'list': {
      const ListTag = (block.ordered ? 'ol' : 'ul') as 'ol'
      return (
        <ListTag
          className={`ml-6 space-y-1.5 text-[color:var(--bm-fg)] ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
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
      return (
        <dl className="space-y-3">
          {block.items.map((item, idx) => (
            <div key={item.id ?? idx}>
              <dt id={item.id ?? undefined} className="scroll-mt-32 font-mono text-sm font-semibold text-[color:var(--bm-fg)]">
                {renderInlines(item.termInlines, ctx, distro)}
              </dt>
              <dd className="mt-1.5 space-y-2 pl-4 text-[color:var(--bm-fg)]">
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
        <div className="overflow-x-auto rounded-[var(--bm-radius)] border border-[var(--bm-border)] bg-[var(--bm-surface)]">
          <table className="w-full border-collapse text-left text-[color:var(--bm-fg)]">
            <thead className="bg-[var(--bm-surface-2)] text-[color:var(--bm-muted)]">
              <tr>
                {block.headers.map((h, idx) => (
                  <th key={idx} className="border-b border-[var(--bm-border)] px-3 py-2 font-mono text-xs font-medium tracking-wide">
                    {highlightText(h, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-[var(--bm-border)] last:border-b-0 even:bg-[var(--bm-surface-2)]">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-sm">
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

function renderInlines(inlines: InlineNode[], ctx: HighlightCtx, distro: Distro): ReactNode[] {
  return inlines.map((inline, idx) => {
    switch (inline.type) {
      case 'text':
        return <span key={idx}>{highlightText(inline.text, ctx)}</span>
      case 'code':
        return (
          <code key={idx} className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-1.5 py-0.5 font-mono text-[0.95em] text-[color:var(--bm-fg)]">
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
            <a key={idx} href={inline.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]">
              <span className="inline-flex items-center gap-1">
                {renderInlines(inline.inlines, ctx, distro)}
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
              {renderInlines(inline.inlines, ctx, distro)}
            </span>
          )
        }
        return (
          <Link key={idx} href={withDistroHref(inline.href, distro)} className="underline underline-offset-4 decoration-[color:var(--bm-accent)/0.6]">
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

function buildAnchorIndex(blocks: BlockNode[]) {
  const map = new Map<string, number>()

  for (const [idx, block] of blocks.entries()) {
    if (block.type === 'heading') map.set(block.id, idx)
    if (block.type === 'code_block' && block.id) map.set(block.id, idx)
    if (block.type === 'definition_list') {
      for (const item of block.items) {
        if (item.id) map.set(item.id, idx)
      }
    }
  }

  return map
}

function estimateBlockSize(block: BlockNode): number {
  if (block.type === 'heading') return block.level <= 2 ? 84 : 64
  if (block.type === 'paragraph') return 92
  if (block.type === 'list') return 140
  if (block.type === 'definition_list') return 220
  if (block.type === 'table') return 260
  if (block.type === 'horizontal_rule') return 40
  if (block.type === 'code_block') {
    const lines = block.text.split('\n').length
    return Math.min(720, 90 + lines * 18)
  }
  return 120
}

function findActiveHeadingId(headings: Array<{ id: string; index: number }>, index: number) {
  if (!headings.length) return null

  let lo = 0
  let hi = headings.length - 1
  let best = 0

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const m = headings[mid]!
    if (m.index <= index) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return headings[best]?.id ?? null
}

function withDistroHref(href: string, distro: Distro): string {
  if (!href.startsWith('/')) return href
  if (distro === 'debian') return href

  const url = new URL(href, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}${url.hash}`
}
