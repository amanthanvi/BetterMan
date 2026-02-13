'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { BlockNode } from '../../lib/docModel'
import type { DocRendererHandle } from '../doc/DocRenderer'
import { buildFindIndex, locateFindMatch } from './findIndex'

const FIND_BAR_KEY = 'bm-find-bar-hidden'
const FIND_DEBOUNCE_MS = 150

function readStoredFindBarHidden(): boolean {
  try {
    return localStorage.getItem(FIND_BAR_KEY) === '1'
  } catch {
    // ignore
  }
  return false
}

function writeStoredFindBarHidden(hidden: boolean) {
  try {
    localStorage.setItem(FIND_BAR_KEY, hidden ? '1' : '0')
  } catch {
    // ignore
  }
}

function getScrollBehavior(): 'auto' | 'smooth' {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function useManPageFind({ blocks }: { blocks: BlockNode[] }) {
  const [find, setFind] = useState('')
  const [findBarHidden, setFindBarHidden] = useState(false)
  const [activeFindIndex, setActiveFindIndex] = useState(0)

  const activeMarkRef = useRef<HTMLElement | null>(null)
  const findInputDesktopRef = useRef<HTMLInputElement | null>(null)
  const findInputMobileRef = useRef<HTMLInputElement | null>(null)
  const docRef = useRef<DocRendererHandle | null>(null)

  useEffect(() => {
    setFindBarHidden(readStoredFindBarHidden())
  }, [])

  const rawFindQuery = find.trim()
  const findQuery = rawFindQuery.length >= 2 ? rawFindQuery : ''

  const [debouncedFindQuery, setDebouncedFindQuery] = useState('')

  useEffect(() => {
    if (!findQuery) {
      setDebouncedFindQuery('')
      return
    }

    const t = window.setTimeout(() => setDebouncedFindQuery(findQuery), FIND_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [findQuery])

  const effectiveFindQuery = debouncedFindQuery
  const isStale = effectiveFindQuery !== findQuery
  const findEnabled = !isStale && effectiveFindQuery.length >= 2

  const findIndex = useMemo(
    () => (findEnabled ? buildFindIndex(blocks, effectiveFindQuery) : null),
    [blocks, effectiveFindQuery, findEnabled],
  )

  const matchCount = findIndex?.total ?? 0
  const displayIndex = matchCount ? Math.min(activeFindIndex, matchCount - 1) : 0

  const findCountLabel =
    rawFindQuery.length < 2
      ? '—'
      : isStale
        ? '…'
        : matchCount
          ? `${displayIndex + 1}/${matchCount}`
          : '0/0'

  const setFindBarHiddenPersisted = (hidden: boolean) => {
    setFindBarHidden(hidden)
    writeStoredFindBarHidden(hidden)
  }

  const focusFindInput = () => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const el = isDesktop ? findInputDesktopRef.current : findInputMobileRef.current
    el?.focus()
    el?.select()
  }

  const scrollToFind = (idx: number) => {
    if (!matchCount) return
    const clamped = ((idx % matchCount) + matchCount) % matchCount
    const scrollBehavior = getScrollBehavior()

    if (docRef.current?.isVirtualized && findIndex) {
      const loc = locateFindMatch(findIndex.prefixByBlock, clamped)
      if (!loc) return

      docRef.current.scrollToBlockIndex(loc.blockIndex, { align: 'center', behavior: scrollBehavior })

      let attempts = 0
      const tick = () => {
        attempts += 1
        const block = document.querySelector<HTMLElement>(`[data-bm-block-index="${loc.blockIndex}"]`)
        const marks = block ? Array.from(block.querySelectorAll<HTMLElement>('mark[data-bm-find]')) : []
        if (marks.length) {
          const el = marks[Math.min(loc.withinBlockIndex, marks.length - 1)]
          if (!el) return
          el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
          if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
          el.classList.add('bm-find-active')
          activeMarkRef.current = el
          return
        }
        if (attempts < 20) window.requestAnimationFrame(tick)
      }

      window.requestAnimationFrame(tick)
      return
    }

    const marks = Array.from(document.querySelectorAll<HTMLElement>('mark[data-bm-find]'))
    if (!marks.length) return
    const el = marks[Math.min(clamped, marks.length - 1)]
    if (!el) return
    el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    el.classList.add('bm-find-active')
    activeMarkRef.current = el
  }

  const goPrev = () => {
    if (!matchCount) return
    const idx = (activeFindIndex - 1 + matchCount) % matchCount
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  const goNext = () => {
    if (!matchCount) return
    const idx = (activeFindIndex + 1) % matchCount
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  const onFindChange = (next: string) => {
    setFind(next)
    setActiveFindIndex(0)
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    activeMarkRef.current = null
  }

  const onClearFind = () => {
    setFind('')
    setActiveFindIndex(0)
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    activeMarkRef.current = null
  }

  return {
    docRef,
    find,
    findBarHidden,
    findInputDesktopRef,
    findInputMobileRef,
    focusFindInput,
    onClearFind,
    onFindChange,
    findQuery: effectiveFindQuery,
    findEnabled,
    matchCount,
    findCountLabel,
    goPrev,
    goNext,
    setFindBarHiddenPersisted,
  }
}
