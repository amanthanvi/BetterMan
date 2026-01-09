import type { KeyboardEvent, RefObject } from 'react'

import type { TocItem } from '../../api/types'
import { Toc } from '../../man/Toc'

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
  return (
    <aside data-bm-sidebar className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
            <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Navigator</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickJumps.map((j) => (
                <a
                  key={j.id}
                  href={`#${j.id}`}
                  onClick={(e) => {
                    if (onQuickJump(j.id)) e.preventDefault()
                  }}
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs hover:bg-[color:var(--bm-bg)/0.55]"
                >
                  {j.title}
                </a>
              ))}
              {!quickJumps.length ? (
                <span className="text-sm text-[color:var(--bm-muted)]">—</span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Find</div>
              {findBarHidden ? (
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                  onClick={onShowFind}
                >
                  Show
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                  onClick={onHideFind}
                >
                  Hide
                </button>
              )}
            </div>

            {!findBarHidden ? (
              <div className="mt-3 space-y-3">
                <input
                  ref={findInputRef}
                  value={find}
                  onChange={(e) => onFindChange(e.target.value)}
                  onKeyDown={onFindKeyDown}
                  placeholder="Find in page…"
                  className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                  aria-label="Find in page"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--bm-muted)]">
                  <div className="font-mono">
                    {findCountLabel}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                      onClick={onPrev}
                      disabled={!matchCount}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                      onClick={onNext}
                      disabled={!matchCount}
                    >
                      Next
                    </button>
                    {find ? (
                      <button
                        type="button"
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                        onClick={onClearFind}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
            <Toc items={tocItems} activeId={activeTocId} onNavigateToId={onTocNavigateToId} />
          </div>
        </div>
      </div>
    </aside>
  )
}
