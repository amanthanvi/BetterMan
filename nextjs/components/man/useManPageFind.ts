'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { applyDocHighlights, clearDocHighlights, type DocFindMatch } from '../../lib/docHighlights'
import { getScrollBehavior } from '../../lib/scroll'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const FIND_DEBOUNCE_MS = 150
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const NO_OPTION_TERMS: readonly string[] = []

export function useManPageFind({
  articleRef,
  optionTerms = NO_OPTION_TERMS,
  documentKey,
}: {
  articleRef: RefObject<HTMLElement | null>
  optionTerms?: readonly string[]
  documentKey?: string
}) {
  const [find, setFind] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const matchesRef = useRef<DocFindMatch[]>([])
  const activeFindIndexRef = useRef(0)
  const activeMarkRef = useRef<DocFindMatch>([])
  const focusRestoreFrameRef = useRef<number | null>(null)
  const pendingFocusRestoreTargetRef = useRef<HTMLElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)

  const rawFindQuery = find.trim()
  const findQuery = rawFindQuery.length >= 2 ? rawFindQuery : ''

  // Shared debounce hook; clearing applies immediately, only typing is debounced.
  const debouncedRaw = useDebouncedValue(findQuery, FIND_DEBOUNCE_MS)
  const debouncedFindQuery = findQuery ? debouncedRaw : ''

  const effectiveFindQuery = debouncedFindQuery
  const isStale = effectiveFindQuery !== findQuery
  const findEnabled = findOpen && !isStale && effectiveFindQuery.length >= 2

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

  const activateMatch = useCallback((index: number, scroll = false) => {
    for (const mark of activeMarkRef.current) mark.classList.remove('bm-find-active')
    const matches = matchesRef.current
    const next = matches.length ? ((index % matches.length) + matches.length) % matches.length : 0
    const marks = matches[next] ?? []
    for (const mark of marks) mark.classList.add('bm-find-active')
    activeMarkRef.current = marks
    activeFindIndexRef.current = next
    setActiveFindIndex(next)
    if (scroll) marks[0]?.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' })
  }, [])

  useEffect(() => {
    activeFindIndexRef.current = 0
    setActiveFindIndex(0)
  }, [documentKey])

  useEffect(() => {
    const article = articleRef.current
    if (!article) return
    let frame: number | null = null
    const observer = new MutationObserver(() => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        update()
      })
    })
    const update = () => {
      // Ignore our own mark insertion/removal; observe only renderer changes,
      // including lazy syntax highlighting replacing a code block's HTML.
      observer.disconnect()
      matchesRef.current = applyDocHighlights(article, {
        findQuery: findEnabled ? effectiveFindQuery : undefined,
        optionTerms,
      })
      setMatchCount(matchesRef.current.length)
      activateMatch(Math.min(activeFindIndexRef.current, Math.max(0, matchesRef.current.length - 1)))
      observer.observe(article, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'hidden', 'inert'],
      })
    }
    update()
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      clearDocHighlights(article)
      matchesRef.current = []
      activeMarkRef.current = []
    }
  }, [activateMatch, articleRef, documentKey, effectiveFindQuery, findEnabled, optionTerms])

  const scrollToFind = (idx: number) => activateMatch(idx, true)

  const goPrev = () => {
    if (!matchCount) return
    const idx = (activeFindIndexRef.current - 1 + matchCount) % matchCount
    scrollToFind(idx)
  }

  const goNext = () => {
    if (!matchCount) return
    const idx = (activeFindIndexRef.current + 1) % matchCount
    scrollToFind(idx)
  }

  const onFindChange = (next: string) => {
    setFind(next)
    activeFindIndexRef.current = 0
    setActiveFindIndex(0)
    for (const mark of activeMarkRef.current) mark.classList.remove('bm-find-active')
    activeMarkRef.current = []
  }

  const onClearFind = () => {
    setFind('')
    activeFindIndexRef.current = 0
    setActiveFindIndex(0)
    for (const mark of activeMarkRef.current) mark.classList.remove('bm-find-active')
    activeMarkRef.current = []
  }

  const closeFind = () => {
    if (focusRestoreFrameRef.current !== null) return
    for (const mark of activeMarkRef.current) mark.classList.remove('bm-find-active')
    activeMarkRef.current = []
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
