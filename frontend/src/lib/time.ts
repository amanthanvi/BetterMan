export function formatRelativeTime(iso: string): string {
  const dt = new Date(iso)
  const ms = dt.getTime()
  if (!Number.isFinite(ms)) return iso

  const diff = Date.now() - ms
  const abs = Math.abs(diff)

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (abs < minute) return 'just now'
  if (abs < hour) return rtf.format(-Math.round(diff / minute), 'minute')
  if (abs < day) return rtf.format(-Math.round(diff / hour), 'hour')
  if (abs < 30 * day) return rtf.format(-Math.round(diff / day), 'day')

  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

