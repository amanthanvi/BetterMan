'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

function isActive(pathname: string, target: string) {
  if (target === '/' && pathname === '/') return true
  if (target !== '/' && pathname === target) return true
  return false
}

type IconProps = { className?: string }

function IconHome({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  )
}

function IconSearch({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function IconClock({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </svg>
  )
}

function IconStar({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </svg>
  )
}

function IconDots({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  )
}

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()

  const Item = ({
    href,
    label,
    icon,
  }: {
    href: string
    label: string
    icon: ReactNode
  }) => {
    const active = isActive(pathname, href)
    return (
      <Link
        href={href}
        className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium ${
          active
            ? 'font-semibold text-[color:var(--bm-fg)] before:absolute before:top-0 before:left-1/2 before:h-0.5 before:w-6 before:-translate-x-1/2 before:rounded-full before:bg-[var(--bm-accent)]'
            : 'text-[color:var(--bm-muted)] hover:text-[color:var(--bm-fg)]'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        {icon}
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.92] backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <Item href="/" label="Home" icon={<IconHome />} />
        <Item href="/search" label="Search" icon={<IconSearch />} />
        <Item href="/history" label="History" icon={<IconClock />} />
        <Item href="/bookmarks" label="Bookmarks" icon={<IconStar />} />
        <button
          type="button"
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium text-[color:var(--bm-muted)] hover:text-[color:var(--bm-fg)]"
          onClick={onMore}
          aria-label="More actions"
        >
          <IconDots />
          <span>More</span>
        </button>
      </div>
    </nav>
  )
}
