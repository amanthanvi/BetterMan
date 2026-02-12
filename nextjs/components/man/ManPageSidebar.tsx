'use client'

import type { KeyboardEvent, RefObject } from 'react'

import type { TocItem } from '../../lib/docModel'
import { ChevronDownIcon } from '../icons'
import { Toc } from '../toc/Toc'
import { getFindA11yStatus } from './findA11y'

export function ManPageSidebar({
  quickJumps,
  onQuickJump,
  findBarHidden,
  onShowFind,
  onHideFind,
  find,
  findInputRef,
  onFindChange,
  onFindKeyDown,
  findCountLabel,
  matchCount,
  onPrev,
  onNext,
  onClearFind,
  tocItems,
  activeTocId,
  onTocNavigateToId,
}: {
  quickJumps: Array<{ id: string; title: string }>
  onQuickJump: (id: string) => boolean
  findBarHidden: boolean
  onShowFind: () => void
  onHideFind: () => void
  find: string
  findInputRef: RefObject<HTMLInputElement | null>
  onFindChange: (next: string) => void
  onFindKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  findCountLabel: string
  matchCount: number
  onPrev: () => void
  onNext: () => void
  onClearFind: () => void
  tocItems: TocItem[]
  activeTocId: string | null
  onTocNavigateToId?: (id: string) => void
}) {
  const activeQuickJumpId = (() => {
    if (!activeTocId) return null
    const idx = tocItems.findIndex((t) => t.id === activeTocId)
    if (idx < 0) return activeTocId

    for (let i = idx; i >= 0; i -= 1) {
      const it = tocItems[i]
      if (it && it.level === 2 && it.id) return it.id
    }

    return activeTocId
  })()

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Quick jumps</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickJumps.map((j) => (
            <a
              key={j.id}
              href={`#${j.id}`}
              onClick={(e) => {
                if (onQuickJump(j.id)) e.preventDefault()
              }}
              className={`rounded-[var(--bm-radius-sm)] border px-2 py-1 font-mono text-xs transition-colors ${
                activeQuickJumpId === j.id
                  ? 'border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] text-[color:var(--bm-fg)]'
                  : 'border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]'
              }`}
            >
              {j.title.toUpperCase()}
            </a>
          ))}
          {!quickJumps.length ? <span className="text-xs text-[color:var(--bm-muted)]">—</span> : null}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Find</div>
          {findBarHidden ? (
            <button
              type="button"
              className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]"
              onClick={onShowFind}
              aria-label="Show find"
            >
              Show
            </button>
          ) : (
            <button
              type="button"
              className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]"
              onClick={onHideFind}
              aria-label="Hide find"
            >
              Hide
            </button>
          )}
        </div>

        {!findBarHidden ? (
          <div className="mt-3 grid gap-3">
            <input
              ref={findInputRef}
              value={find}
              onChange={(e) => onFindChange(e.target.value)}
              onKeyDown={onFindKeyDown}
              placeholder="Find in page…"
              className="h-10 w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 font-mono text-sm text-[color:var(--bm-fg)] placeholder:text-[color:var(--bm-muted)] outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Find in page"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-xs text-[color:var(--bm-muted)]">{findCountLabel}</div>
              <div aria-live="polite" className="sr-only">
                {getFindA11yStatus(find, findCountLabel)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)] disabled:opacity-50"
                  onClick={onPrev}
                  disabled={!matchCount}
                  aria-label="Previous match"
                >
                  <ChevronDownIcon className="size-4 -rotate-180" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)] disabled:opacity-50"
                  onClick={onNext}
                  disabled={!matchCount}
                  aria-label="Next match"
                >
                  <ChevronDownIcon className="size-4" />
                </button>
                {find ? (
                  <button
                    type="button"
                    className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 font-mono text-xs text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]"
                    onClick={onClearFind}
                    aria-label="Clear find"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Contents</div>
        <div className="mt-3">
          <Toc items={tocItems} activeId={activeTocId} onNavigateToId={onTocNavigateToId} showTitle={false} />
        </div>
      </div>
    </div>
  )
}
