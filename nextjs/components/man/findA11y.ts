export function getFindA11yStatus(find: string, label: string): string {
  const q = find.trim()
  if (q.length < 2) return ''
  if (label === '…') return 'Searching'
  if (label === '0/0') return 'No matches'
  const m = /^(\d+)\/(\d+)$/.exec(label)
  if (!m) return ''
  const current = Number(m[1])
  const total = Number(m[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return ''
  return `Match ${current} of ${total}`
}
