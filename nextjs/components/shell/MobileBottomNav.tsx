'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function isActive(pathname: string, target: string) {
  if (target === '/' && pathname === '/') return true
  if (target !== '/' && pathname === target) return true
  return false
}

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()

  const Item = ({
    href,
    label,
  }: {
    href: string
    label: string
  }) => {
    const active = isActive(pathname, href)
    return (
      <Link
        href={href}
        className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium ${
          active ? 'text-[color:var(--bm-fg)]' : 'text-[color:var(--bm-muted)] hover:text-[color:var(--bm-fg)]'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <Item href="/" label="Home" />
        <Item href="/search" label="Search" />
        <Item href="/history" label="History" />
        <Item href="/bookmarks" label="Bookmarks" />
        <button
          type="button"
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-[color:var(--bm-muted)] hover:text-[color:var(--bm-fg)]"
          onClick={onMore}
        >
          <span>More</span>
        </button>
      </div>
    </nav>
  )
}
