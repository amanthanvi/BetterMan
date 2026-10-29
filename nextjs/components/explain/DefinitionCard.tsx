'use client'

import { useEffect, useRef } from 'react'

import { noteId } from '../../lib/explain'

/**
 * One definition at a time, under the token grid. It floats (on phones it pins
 * under the site header while the grid and notes scroll), so it takes the
 * overlay chrome. Its content is a clone of the server-rendered note, so the
 * card never says anything the list does not.
 */
export function DefinitionCard({ selected, onClose }: { selected: number | null; onClose: () => void }) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const note = selected === null ? null : document.getElementById(noteId(selected))?.querySelector('[data-bm-note-body]')
    body.replaceChildren(...(note ? [note.cloneNode(true)] : []))
  }, [selected])

  return (
    <section
      aria-label="Definition"
      aria-live="polite"
      hidden={selected === null}
      className="bm-xcard mt-5 border border-rule-2 bg-raised px-4 py-3 shadow-overlay md:px-5 md:py-4"
    >
      <div className="flex items-start gap-3">
        <div ref={bodyRef} className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close definition"
          className="-mt-1 -mr-2 inline-flex size-9 shrink-0 items-center justify-center text-ink-2 hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
    </section>
  )
}
