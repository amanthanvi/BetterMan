'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { HomeIcon, SearchIcon, StarIcon } from '../icons'

function MobileBottomNavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: ReactNode
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-3 py-2 font-mono text-xs ${
        active
          ? 'font-semibold text-fg before:absolute before:top-0 before:left-1/2 before:h-0.5 before:w-6 before:-translate-x-1/2 before:rounded-sm before:bg-accent'
          : 'text-muted hover:text-fg'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      data-bm-mobile-nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-edge bg-raised sm:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <MobileBottomNavItem href="/" label="Home" icon={<HomeIcon />} active={pathname === '/'} />
        <MobileBottomNavItem href="/search" label="Search" icon={<SearchIcon />} active={pathname === '/search'} />
        {/* Anchor into the home dashboard; the hash is invisible to usePathname,
            so this tab never claims aria-current (Home owns "/"). */}
        <MobileBottomNavItem href="/#bookmarks" label="Bookmarks" icon={<StarIcon />} active={false} />
      </div>
    </nav>
  )
}
