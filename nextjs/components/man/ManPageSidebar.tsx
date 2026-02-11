'use client'

import type { KeyboardEvent, RefObject } from 'react'

import type { TocItem } from '../../lib/docModel'
import { Toc } from '../toc/Toc'

function getFindA11yStatus(find: string, label: string): string {
  const q = find.trim()
  if (q.length < 2) return ''
  if (label === '…') return 'Searching'
  if (label === '0/0') return 'No matches'
  const m = /^(\d+)\/(\d+)$/.exec(label)
  if (!m) return ''
  const current = Number(m[1])
  const total = Number(m[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return ''
  return `Match ${current} of ${total}`
}

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
    <aside data-bm-sidebar aria-label="Navigator sidebar" className="hidden lg:block">
      <div
        className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] focus:ring-offset-2 focus:ring-offset-[var(--bm-bg)]"
        tabIndex={0}
        aria-label="Navigator"
      >
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
                  className={`rounded-full border px-3 py-1 text-xs ${
                    activeQuickJumpId === j.id
                      ? 'border-[color:var(--bm-accent)/0.4] bg-[color:var(--bm-accent)/0.12] hover:bg-[color:var(--bm-accent)/0.16]'
                      : 'border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] hover:bg-[color:var(--bm-bg)/0.55]'
                  }`}
                >
                  {j.title}
                </a>
              ))}
              {!quickJumps.length ? <span className="text-sm text-[color:var(--bm-muted)]">—</span> : null}
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
                  aria-label="Show find bar"
                >
                  Show
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                  onClick={onHideFind}
                  aria-label="Hide find bar"
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
                  <div className="font-mono">{findCountLabel}</div>
                  <div aria-live="polite" className="sr-only">
                    {getFindA11yStatus(find, findCountLabel)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                      onClick={onPrev}
                      disabled={!matchCount}
                      aria-label="Previous match"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                      onClick={onNext}
                      disabled={!matchCount}
                      aria-label="Next match"
                    >
                      Next
                    </button>
                    {find ? (
                      <button
                        type="button"
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                        onClick={onClearFind}
                        aria-label="Clear find query"
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
