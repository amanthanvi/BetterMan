import type { TocItem } from '../api/types'

export function Toc({
  items,
  onNavigate,
  showTitle = true,
}: {
  items: TocItem[]
  onNavigate?: () => void
  showTitle?: boolean
}) {
  if (!items.length) return null

  return (
    <nav aria-label="On this page" className="space-y-2 text-sm">
      {showTitle ? (
        <div className="text-xs font-medium uppercase tracking-wider text-[color:var(--bm-muted)]">
          On this page
        </div>
      ) : null}
      <ol className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-[color:var(--bm-muted)]">
            <a
              href={`#${item.id}`}
              onClick={() => onNavigate?.()}
              className="block rounded px-2 py-1 no-underline hover:bg-[color:var(--bm-surface)/0.8] hover:text-[color:var(--bm-fg)]"
              style={{ paddingLeft: `${Math.min(5, Math.max(0, item.level - 2)) * 0.75 + 0.5}rem` }}
            >
              {item.title.length > 44 ? `${item.title.slice(0, 44)}…` : item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
