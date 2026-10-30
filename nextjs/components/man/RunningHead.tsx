import type { ReactNode } from 'react'

import type { Distro } from '../../lib/distro'
import type { ServerT } from '../../lib/i18n/server'

const SECTION_KEYS = {
  '1': 'User Commands',
  '2': 'System Calls',
  '3': 'Library Functions',
  '4': 'Special Files',
  '5': 'File Formats',
  '6': 'Games',
  '7': 'Miscellany',
  '8': 'System Administration',
  '9': 'Kernel Routines',
} as const

/** The BSD manuals name two sections differently: 4 is "Kernel Interfaces" and 7 "Miscellaneous Information". */
export function bsdSectionLabel(section: string, distro: Distro | null | undefined, t: ServerT): string | null {
  if (distro !== 'freebsd' && distro !== 'macos') return null
  const digit = section.trim().charAt(0)
  return digit === '4' ? t('Kernel Interfaces') : digit === '7' ? t('Miscellaneous Information') : null
}

/* Keyed on the leading digit so extended sections (1ssl, 3p) resolve too. `distro` is the system the page is from. */
export function sectionLabel(section: string, t: ServerT, distro?: Distro | null): string {
  const digit = section.trim().charAt(0) as keyof typeof SECTION_KEYS
  return bsdSectionLabel(section, distro, t) ?? t(SECTION_KEYS[digit] ?? 'Manual')
}

/**
 * The classic three-part running head of a typeset manual page:
 * TAR(1)        User Commands        TAR(1)
 * Typographic furniture in small caps over a hairline. aria-hidden so it never
 * competes with the page's real heading. The middle part drops on phones.
 */
export function RunningHead({
  title,
  label,
  end = title,
  className,
}: {
  title: string
  label: string
  end?: string
  className?: string
}) {
  return (
    <p aria-hidden="true" className={`bm-rh ${className ?? ''}`}>
      <span>{title}</span>
      <span>{label}</span>
      <span>{end}</span>
    </p>
  )
}

/** The running foot that closes a page, over a hairline: edition · system · TAR(1). */
export function RunningFoot({ start, label, end }: { start: string; label: string; end: string }) {
  return (
    <p aria-hidden="true" className="bm-rh bm-rf">
      <span>{start}</span>
      <span>{label}</span>
      <span>{end}</span>
    </p>
  )
}

/** A small-caps serif label — SYNOPSIS, CONTENTS, RECENT, BROWSE, … */
export function ManSectionLabel({
  children,
  as: Tag = 'div',
  id,
  className,
}: {
  children: ReactNode
  as?: 'div' | 'h2' | 'h3'
  id?: string
  className?: string
}) {
  return (
    <Tag id={id} className={`small-caps text-base font-normal text-ink-3 ${className ?? ''}`}>
      {children}
    </Tag>
  )
}
