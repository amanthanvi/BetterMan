'use client'

import { useLayoutEffect, useRef, useState } from 'react'

import type { TocItem } from '../../lib/docModel'

const TOC_INDENT_CLASSES = [
  'pl-[0.75rem]',
  'pl-[1.25rem]',
  'pl-[1.75rem]',
  'pl-[2.25rem]',
  'pl-[2.75rem]',
  'pl-[3.25rem]',
] as const

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
      {showTitle ? <div className="font-mono text-xs tracking-wide text-muted">On this page</div> : null}
      <ol ref={listRef} className="relative space-y-1">
        {marker ? (
          <span
            aria-hidden="true"
            className="bm-toc-marker pointer-events-none absolute left-0 w-0.5 bg-accent"
            style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
          />
        ) : null}
        {items.map((item) => {
          const active = activeId === item.id
          const indent = TOC_INDENT_CLASSES[Math.min(5, Math.max(0, item.level - 2))]

          return (
            <li key={item.id} className="text-sm">
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
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
                className={`block py-1 pr-2 no-underline transition-colors ${indent} ${
                  active ? 'font-medium text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                <span className="block truncate">{item.title.length > 52 ? `${item.title.slice(0, 52)}…` : item.title}</span>
              </a>
            </li>
          )
        })}
      </ol>
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
