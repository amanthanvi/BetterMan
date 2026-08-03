'use client'

import type { KeyboardEvent, RefObject } from 'react'

import { ChevronDownIcon } from '../icons'
import { IconButton } from '../ui/IconButton'
import { getFindA11yStatus } from './findA11y'

type IconProps = { className?: string }

function IconX({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

/**
 * The one find-in-page UI: a floating bar below the header on desktop,
 * above the bottom nav on mobile.
 */
export function ManPageFindBar({
  open,
  onClose,
  find,
  findInputRef,
  onFindChange,
  onFindKeyDown,
  findCountLabel,
  matchCount,
  onPrev,
  onNext,
}: {
  open: boolean
  onClose: () => void
  find: string
  findInputRef: RefObject<HTMLInputElement | null>
  onFindChange: (next: string) => void
  onFindKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  findCountLabel: string
  matchCount: number
  onPrev: () => void
  onNext: () => void
}) {
  if (!open) return null

  return (
    <div
      data-bm-findbar
      className="bm-rise-in fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border border-edge bg-raised p-2 shadow-lg shadow-black/20 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[4.25rem] sm:w-[24rem]"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={findInputRef}
          name="bm-find"
          value={find}
          onChange={(e) => onFindChange(e.target.value)}
          onKeyDown={onFindKeyDown}
          placeholder="Find in page…"
          className="h-9 min-w-0 flex-1 border-0 border-b border-edge bg-transparent px-1 font-mono text-sm text-fg placeholder:text-muted"
          aria-label="Find in page"
        />

        <div className="min-w-[3.5rem] text-center font-mono text-xs text-muted">{findCountLabel}</div>
        <div aria-live="polite" className="sr-only">
          {getFindA11yStatus(find, findCountLabel)}
        </div>

        <IconButton variant="ghost" size="sm" onClick={onPrev} disabled={!matchCount} aria-label="Previous match">
          <ChevronDownIcon className="size-4 rotate-180" />
        </IconButton>
        <IconButton variant="ghost" size="sm" onClick={onNext} disabled={!matchCount} aria-label="Next match">
          <ChevronDownIcon className="size-4" />
        </IconButton>
        <IconButton variant="ghost" size="sm" onClick={onClose} aria-label="Close find">
          <IconX className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
