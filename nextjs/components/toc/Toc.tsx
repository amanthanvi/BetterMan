'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { TocItem } from '../../lib/docModel'
import { sectionNumbers } from '../man/sectionNumbers'

/* Sections in small caps, subsections indented under them, deeper headings further in. */
const TOC_LEVEL_CLASSES = [
  'small-caps text-[0.9375rem] tracking-[0.06em]',
  'pl-7 text-[0.84375rem]',
  'pl-10 text-[0.84375rem]',
  'pl-12 text-[0.84375rem]',
] as const

const TOC_TITLE_MAX_LENGTH = 52

export function Toc({
  items,
  activeId,
  onNavigate,
  onNavigateToId,
  showTitle = true,
}: {
  items: TocItem[]
  activeId?: string | null
  onNavigate?: () => void
  onNavigateToId?: (id: string) => void
  showTitle?: boolean
}) {
  const listRef = useRef<HTMLOListElement | null>(null)
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null)
  const numbers = useMemo(() => sectionNumbers(items), [items])
  const top = items.length ? Math.min(...items.map((item) => item.level)) : 2

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !activeId) {
      setMarker(null)
      return
    }
    const el = list.querySelector<HTMLElement>(`a[aria-current="location"]`)
    if (!el) {
      setMarker(null)
      return
    }
    setMarker({ top: el.offsetTop, height: el.offsetHeight })
  }, [activeId, items])

  if (!items.length) return null

  return (
    <nav
      aria-label="On this page"
      className="space-y-2"
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
          e.preventDefault()
          moveFocus(e.currentTarget, 1)
        } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
          e.preventDefault()
          moveFocus(e.currentTarget, -1)
        }
      }}
    >
      {showTitle ? <div className="small-caps text-sm text-ink-3">Contents</div> : null}
      {/* The marker sits beside the list, not in it: an <ol> holds only <li>. */}
      <div className="relative">
        {marker ? (
          <span
            aria-hidden="true"
            className="bm-toc-marker pointer-events-none absolute left-0 top-0 w-0.5 bg-accent"
            style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
          />
        ) : null}
        <ol ref={listRef}>
          {items.map((item) => {
            const active = activeId === item.id
            const depth = Math.min(3, Math.max(0, item.level - top))
            const truncated = item.title.length > TOC_TITLE_MAX_LENGTH
            const n = numbers.get(item.id)

            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active ? 'location' : undefined}
                  title={truncated ? item.title : undefined}
                  onClick={(e) => {
                    if (onNavigateToId) {
                      e.preventDefault()
                      try {
                        window.location.hash = item.id
                      } catch {
                        // ignore
                      }
                      onNavigateToId(item.id)
                    }

                    onNavigate?.()
                  }}
                  className={`flex gap-2 py-[0.22rem] pl-3.5 pr-2 font-serif leading-[1.35] no-underline ${TOC_LEVEL_CLASSES[depth]} ${
                    active ? 'font-semibold text-ink' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {n ? (
                    <span aria-hidden="true" className={`shrink-0 font-normal [font-variant-caps:normal] oldstyle-nums ${depth ? 'min-w-7' : 'min-w-4'}`}>
                      {n}
                    </span>
                  ) : null}
                  <span>{truncated ? `${item.title.slice(0, TOC_TITLE_MAX_LENGTH)}…` : item.title}</span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}

function moveFocus(container: HTMLElement, delta: number) {
  const links = Array.from(container.querySelectorAll('a[href^="#"]')) as HTMLAnchorElement[]
  if (!links.length) return

  const active = document.activeElement
  const idx = links.findIndex((l) => l === active)
  const next = idx === -1 ? 0 : (idx + delta + links.length) % links.length
  links[next]?.focus()
}
