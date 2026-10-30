import type { T } from '../../lib/i18n/translate'

export function getFindA11yStatus(find: string, label: string, t: T<'Searching' | 'No matches' | 'Match {index} of {count}'>): string {
  const q = find.trim()
  if (q.length < 2) return ''
  if (label === '…') return t('Searching')
  if (label === '0/0') return t('No matches')
  const m = /^(\d+)\/(\d+)$/.exec(label)
  if (!m) return ''
  const current = Number(m[1])
  const total = Number(m[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return ''
  return t('Match {index} of {count}', { index: current, count: total })
}
