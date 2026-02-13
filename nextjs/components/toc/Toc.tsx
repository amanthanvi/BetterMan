'use client'

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
      {showTitle ? (
        <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">On this page</div>
      ) : null}
      <ol className="space-y-1">
        {items.map((item) => {
          const active = activeId === item.id
          const indent = TOC_INDENT_CLASSES[Math.min(5, Math.max(0, item.level - 2))]

          return (
            <li key={item.id} className="text-sm">
              <a
                href={`#${item.id}`}
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
                className={`block border-l-2 py-1.5 pr-2 no-underline transition-colors ${indent} ${
                  active
                    ? 'border-[var(--bm-accent)] text-[color:var(--bm-fg)]'
                    : 'border-transparent text-[color:var(--bm-muted)] hover:border-[var(--bm-border-accent)] hover:text-[color:var(--bm-fg)]'
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
