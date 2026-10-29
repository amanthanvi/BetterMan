'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { BlockNode } from '../../lib/docModel'
import { getScrollBehavior, scrollElementIntoView } from '../../lib/scroll'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { countFindMatches } from './findCount'

const FIND_DEBOUNCE_MS = 150
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function useManPageFind({ blocks }: { blocks: BlockNode[] }) {
  const [find, setFind] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [activeFindIndex, setActiveFindIndex] = useState(0)

  const activeMarkRef = useRef<HTMLElement | null>(null)
  const focusRestoreFrameRef = useRef<number | null>(null)
  const pendingFocusRestoreTargetRef = useRef<HTMLElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)

  const rawFindQuery = find.trim()
  const findQuery = rawFindQuery.length >= 2 ? rawFindQuery : ''

  // Clearing the query applies at once; only typing is debounced.
  const debouncedQuery = useDebouncedValue(findQuery, FIND_DEBOUNCE_MS)
  const effectiveFindQuery = findQuery ? debouncedQuery : ''
  const isStale = effectiveFindQuery !== findQuery
  const findEnabled = !isStale && effectiveFindQuery.length >= 2

  const matchCount = useMemo(
    () => (findEnabled ? countFindMatches(blocks, effectiveFindQuery) : 0),
    [blocks, effectiveFindQuery, findEnabled],
  )
  const displayIndex = matchCount ? Math.min(activeFindIndex, matchCount - 1) : 0

  const findCountLabel =
    rawFindQuery.length < 2
      ? '—'
      : isStale
        ? '…'
        : matchCount
          ? `${displayIndex + 1}/${matchCount}`
          : '0/0'

  const focusFindInput = useCallback(() => {
    const el = findInputRef.current
    el?.focus()
    el?.select()
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!findOpen) return
    focusFindInput()
  }, [findOpen, focusFindInput])

  useEffect(
    () => () => {
      if (focusRestoreFrameRef.current !== null) window.cancelAnimationFrame(focusRestoreFrameRef.current)
      pendingFocusRestoreTargetRef.current = null
    },
    [],
  )

  const openFind = () => {
    const restoreWasPending = focusRestoreFrameRef.current !== null
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current)
      focusRestoreFrameRef.current = null
      previouslyFocusedRef.current = pendingFocusRestoreTargetRef.current
      pendingFocusRestoreTargetRef.current = null
    }
    if (!findOpen) {
      if (!restoreWasPending) {
        previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      }
      setFindOpen(true)
      return
    }
    focusFindInput()
  }

  const scrollToFind = useCallback(
    (idx: number) => {
      if (!matchCount) return
      const clamped = ((idx % matchCount) + matchCount) % matchCount
      const scrollBehavior = getScrollBehavior()

      const marks = Array.from(document.querySelectorAll<HTMLElement>('mark[data-bm-find]'))
      if (!marks.length) return
      const el = marks[Math.min(clamped, marks.length - 1)]
      if (!el) return
      scrollElementIntoView(el, { behavior: scrollBehavior, block: 'center' })
      if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
      el.classList.add('bm-find-active')
      activeMarkRef.current = el
    },
    [matchCount],
  )

  // A settled query shows its first match, as browser find does.
  useEffect(() => {
    if (findEnabled) scrollToFind(0)
  }, [effectiveFindQuery, findEnabled, scrollToFind])

  const goPrev = () => {
    if (!matchCount) return
    const idx = (activeFindIndex - 1 + matchCount) % matchCount
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  const goNext = () => {
    if (!matchCount) return
    // Until a match is on screen, Enter shows the current one instead of skipping it.
    const idx = activeMarkRef.current?.isConnected ? (activeFindIndex + 1) % matchCount : displayIndex
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

  const closeFind = () => {
    if (focusRestoreFrameRef.current !== null) return
    // Clear the highlight but keep the position: the marks stay, and n / N resume
    // from this match rather than showing it again.
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    const previouslyFocused = previouslyFocusedRef.current
    previouslyFocusedRef.current = null
    pendingFocusRestoreTargetRef.current = previouslyFocused
    setFindOpen(false)
    focusRestoreFrameRef.current = window.requestAnimationFrame(() => {
      focusRestoreFrameRef.current = null
      const focusTarget = pendingFocusRestoreTargetRef.current
      pendingFocusRestoreTargetRef.current = null
      focusTarget?.focus({ preventScroll: true })
    })
  }

  return {
    find,
    findOpen,
    findInputRef,
    focusFindInput,
    openFind,
    closeFind,
    onClearFind,
    onFindChange,
    findQuery: effectiveFindQuery,
    findEnabled,
    matchCount,
    findCountLabel,
    goPrev,
    goNext,
  }
}
