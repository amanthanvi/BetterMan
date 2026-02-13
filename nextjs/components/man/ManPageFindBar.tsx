'use client'

import type { KeyboardEvent, RefObject } from 'react'

import { getFindA11yStatus } from './findA11y'

type IconProps = { className?: string }

function IconChevronLeft({ className }: IconProps) {
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function IconChevronRight({ className }: IconProps) {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

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

export function ManPageFindBar({
  hidden,
  onShow,
  onHide,
  find,
  findInputRef,
  onFindChange,
  onFindKeyDown,
  findCountLabel,
  matchCount,
  onPrev,
  onNext,
}: {
  hidden: boolean
  onShow: () => void
  onHide: () => void
  find: string
  findInputRef: RefObject<HTMLInputElement | null>
  onFindChange: (next: string) => void
  onFindKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  findCountLabel: string
  matchCount: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div data-bm-findbar className={`sticky top-16 z-10 lg:hidden ${hidden ? 'mb-4' : 'mb-8'}`}>
      {hidden ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-4 py-2 text-sm font-medium text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            aria-label="Show find"
            onClick={onShow}
          >
            Find
          </button>
        </div>
      ) : (
        <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-2">
          <div className="flex items-center gap-2">
            <input
              ref={findInputRef}
              name="bm-find"
              value={find}
              onChange={(e) => onFindChange(e.target.value)}
              onKeyDown={onFindKeyDown}
              placeholder="Find…"
              className="h-10 min-w-0 flex-1 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 font-mono text-sm text-[color:var(--bm-fg)] placeholder:text-[color:var(--bm-muted)] outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Find in page"
            />

            <div className="font-mono text-xs text-[color:var(--bm-muted)]">{findCountLabel}</div>
            <div aria-live="polite" className="sr-only">
              {getFindA11yStatus(find, findCountLabel)}
            </div>

            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)] disabled:opacity-50"
              onClick={onPrev}
              disabled={!matchCount}
              aria-label="Previous match"
            >
              <IconChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)] disabled:opacity-50"
              onClick={onNext}
              disabled={!matchCount}
              aria-label="Next match"
            >
              <IconChevronRight className="size-4" />
            </button>

            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]"
              onClick={onHide}
              aria-label="Hide find"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
