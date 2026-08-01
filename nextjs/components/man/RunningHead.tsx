const SECTION_LABELS: Record<string, string> = {
  '1': 'User Commands',
  '2': 'System Calls',
  '3': 'Library Functions',
  '4': 'Kernel Interfaces',
  '5': 'File Formats',
  '6': 'Games',
  '7': 'Miscellaneous',
  '8': 'System Administration',
  '9': 'Kernel Routines',
}

/* Keyed on the leading digit so extended sections (1ssl, 3p) resolve too. */
export function sectionLabel(section: string): string {
  const digit = section.trim().charAt(0)
  return SECTION_LABELS[digit] ?? 'Manual'
}

/**
 * The classic three-part running head of a typeset manual page:
 * TAR(1)        User Commands        TAR(1)
 * Pure typographic furniture — aria-hidden so it never competes with the
 * page's real heading.
 */
export function RunningHead({ title, label }: { title: string; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-baseline justify-between gap-4 border-b border-edge pb-2 font-mono text-xs tracking-[0.08em] text-muted"
    >
      <span>{title}</span>
      <span className="hidden sm:block">{label}</span>
      <span>{title}</span>
    </div>
  )
}

/** Small-caps mono section label — NAME, SYNOPSIS, OPTIONS, … */
export function ManSectionLabel({
  children,
  as: Tag = 'div',
  className,
}: {
  children: React.ReactNode
  as?: 'div' | 'h2'
  className?: string
}) {
  return (
    <Tag className={`font-mono text-xs font-semibold tracking-[0.08em] text-muted ${className ?? ''}`}>{children}</Tag>
  )
}
