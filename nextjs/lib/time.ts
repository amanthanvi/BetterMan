/** `lang` is the UI language (default: the browser's); `justNow` is the catalog's `time.justNow`. */
export function formatRelativeTime(iso: string, lang?: string, justNow = 'just now'): string {
  const dt = new Date(iso)
  const ms = dt.getTime()
  if (!Number.isFinite(ms)) return iso

  const diff = Date.now() - ms
  const abs = Math.abs(diff)

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })

  if (abs < minute) return justNow
  if (abs < hour) return rtf.format(-Math.round(diff / minute), 'minute')
  if (abs < day) return rtf.format(-Math.round(diff / hour), 'hour')
  if (abs < 30 * day) return rtf.format(-Math.round(diff / day), 'day')

  return dt.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' })
}

