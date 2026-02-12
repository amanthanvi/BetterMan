export type TextRange = { start: number; end: number }

export function overlapsAny(a: TextRange, ranges: TextRange[]): boolean {
  return ranges.some((b) => a.start < b.end && b.start < a.end)
}

export function getRanges(text: string, regex: RegExp): TextRange[] {
  const ranges: TextRange[] = []
  regex.lastIndex = 0
  while (true) {
    const m = regex.exec(text)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (end > start) ranges.push({ start, end })
    if (!m[0].length) regex.lastIndex += 1
  }
  return ranges
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&')
}
