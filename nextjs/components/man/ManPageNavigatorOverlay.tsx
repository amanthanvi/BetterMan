'use client'

import type { KeyboardEvent, RefObject } from 'react'

import type { TocItem } from '../../lib/docModel'
import { ManPageSidebar } from './ManPageSidebar'

type ManPageNavigatorOverlayProps = {
  open: boolean
  onClose: () => void

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
}

export function ManPageNavigatorOverlay({
  open,
  onClose,
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
}: ManPageNavigatorOverlayProps) {
  return (
    <div className="hidden lg:block">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigator"
        aria-hidden={!open}
        className={`fixed inset-0 z-30 ${open ? '' : 'pointer-events-none'}`}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        <div
          data-bm-sidebar
          className={`absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-5 transition-transform ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Navigator</div>
            <button
              type="button"
              className="rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]"
              onClick={onClose}
              aria-label="Close navigator"
            >
              Close
            </button>
          </div>

          <div className="mt-5">
            <ManPageSidebar
              quickJumps={quickJumps}
              onQuickJump={onQuickJump}
              findBarHidden={findBarHidden}
              onShowFind={onShowFind}
              onHideFind={onHideFind}
              find={find}
              findInputRef={findInputRef}
              onFindChange={onFindChange}
              onFindKeyDown={onFindKeyDown}
              findCountLabel={findCountLabel}
              matchCount={matchCount}
              onPrev={onPrev}
              onNext={onNext}
              onClearFind={onClearFind}
              tocItems={tocItems}
              activeTocId={activeTocId}
              onTocNavigateToId={onTocNavigateToId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
