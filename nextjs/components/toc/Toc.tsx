'use client'

import type { TocItem } from '../../lib/docModel'

const TOC_INDENT_CLASSES = [
  'pl-[0.5rem]',
  'pl-[1.25rem]',
  'pl-[2rem]',
  'pl-[2.75rem]',
  'pl-[3.5rem]',
  'pl-[4.25rem]',
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
      className="space-y-2 text-sm"
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
      {showTitle ? <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">On this page</div> : null}
      <ol className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-[color:var(--bm-muted)]">
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                if (onNavigateToId) {
                  e.preventDefault()
                  try {
                    window.history.pushState(null, '', `#${item.id}`)
                  } catch {
                    try {
                      window.location.hash = item.id
                    } catch {
                      // ignore
                    }
                  }
                  onNavigateToId(item.id)
                }

                onNavigate?.()
              }}
              className={`group block rounded-xl py-1.5 pr-2 no-underline transition ${
                activeId === item.id
                  ? 'bg-[color:var(--bm-accent)/0.12] text-[color:var(--bm-fg)]'
                  : 'hover:bg-[color:var(--bm-bg)/0.5] hover:text-[color:var(--bm-fg)]'
              } ${TOC_INDENT_CLASSES[Math.min(5, Math.max(0, item.level - 2))]}`}
            >
              <span className="inline-flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className={`h-[0.55rem] w-[0.35rem] rounded-full border border-[var(--bm-border)] ${
                    activeId === item.id ? 'bg-[var(--bm-accent)]' : 'bg-[color:var(--bm-bg)/0.4] opacity-0 group-hover:opacity-100'
                  }`}
                />
                <span>{item.title.length > 44 ? `${item.title.slice(0, 44)}…` : item.title}</span>
              </span>
            </a>
          </li>
        ))}
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

