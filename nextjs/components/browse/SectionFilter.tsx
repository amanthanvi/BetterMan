'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * One field over the section listing. Without JavaScript it searches the whole
 * section (its form's GET submit). With it, typing also narrows the names on
 * this page as you type; Enter still searches the section. Narrowing hides
 * rows and empty letter groups only; it never fetches or reorders.
 */
export function SectionFilter({ section, shown }: { section: string; shown: number }) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(shown)
  const listRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    listRef.current = document.querySelector<HTMLElement>('[data-bm-section-list]')
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const needle = value.trim().toLowerCase()
    let count = 0
    for (const group of list.querySelectorAll<HTMLElement>('[data-bm-letter]')) {
      let any = false
      for (const row of group.querySelectorAll<HTMLElement>('li')) {
        const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
        row.hidden = !match
        if (match) {
          any = true
          count += 1
        }
      }
      group.hidden = !any
    }
    setVisible(count)
  }, [value])

  return (
    <>
      <input
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value.slice(0, 120))}
        placeholder={`Filter section ${section}`}
        autoComplete="off"
        spellCheck={false}
        className="bm-field py-1 text-sm placeholder:font-serif placeholder:italic"
        aria-label={`Filter section ${section}`}
        aria-describedby="bm-section-count"
      />
      <span id="bm-section-count" aria-live="polite" className="shrink-0 text-xs text-ink-3">
        {value.trim() ? `${visible} of ${shown} on this page` : `${shown} on this page`}
      </span>
    </>
  )
}
