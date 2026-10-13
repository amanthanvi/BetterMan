'use client'

import { useWindowVirtualizer } from '@tanstack/react-virtual'
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { Distro } from '../../lib/distro'
import type { BlockNode } from '../../lib/docModel'
import { getScrollBehavior, scrollToIdWhenRendered } from '../../lib/scroll'
import { escapeRegExp } from '../../lib/textRanges'
import { BlockView, blockKey, buildOptionRegex, type HighlightCtx } from './BlockView'

type BmScrollBehavior = 'auto' | 'smooth'

export type DocRendererHandle = {
  isVirtualized: boolean
  scrollToBlockIndex: (index: number, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => void
  scrollToAnchor: (id: string, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => void
}

const VIRTUALIZE_BLOCK_COUNT = 100
const VIRTUALIZE_ESTIMATED_HEIGHT = 9_000
const VIRTUALIZE_HEAVY_BLOCK_COUNT = 60

export const DocRenderer = memo(forwardRef<
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

  const shouldVirtualize = shouldVirtualizeBlocks(blocks)
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
    scrollToIdWhenRendered(id, { behavior: opts.behavior, block: opts.block })
  }, [])

  const scrollToBlockIndex = useCallback(
    (index: number, opts?: { align?: 'start' | 'center'; behavior?: BmScrollBehavior }) => {
      if (!isVirtualized) return

      const behavior = opts?.behavior ?? getScrollBehavior()
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
      const behavior = opts?.behavior ?? getScrollBehavior()
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
}))

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

const CODE_LINE_COUNT_CACHE = new WeakMap<object, number>()

function countCodeLines(block: { text: string }): number {
  const cached = CODE_LINE_COUNT_CACHE.get(block as object)
  if (cached != null) return cached

  let lines = 1
  for (let i = 0; i < block.text.length; i += 1) {
    if (block.text.charCodeAt(i) === 10) lines += 1
  }

  CODE_LINE_COUNT_CACHE.set(block as object, lines)
  return lines
}

function estimateBlockSize(block: BlockNode): number {
  if (block.type === 'heading') return block.level <= 2 ? 84 : 64
  if (block.type === 'paragraph') return 92
  if (block.type === 'list') return 140
  if (block.type === 'definition_list') return 220
  if (block.type === 'table') return 260
  if (block.type === 'horizontal_rule') return 40
  if (block.type === 'code_block') {
    const lines = countCodeLines(block)
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

export function shouldVirtualizeBlocks(blocks: BlockNode[]): boolean {
  if (blocks.length >= VIRTUALIZE_BLOCK_COUNT) return true
  if (blocks.length < VIRTUALIZE_HEAVY_BLOCK_COUNT) return false

  let estimatedHeight = 0
  for (const block of blocks) {
    estimatedHeight += estimateBlockSize(block)
    if (estimatedHeight >= VIRTUALIZE_ESTIMATED_HEIGHT) return true
  }
  return false
}
