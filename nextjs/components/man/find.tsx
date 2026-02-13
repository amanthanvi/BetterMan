'use client'

function cutFlagArgumentSyntax(token: string): string {
  const cutChars = ['[', '=', '<'] as const
  let cutAt = token.length

  for (const ch of cutChars) {
    const idx = token.indexOf(ch)
    if (idx >= 0) cutAt = Math.min(cutAt, idx)
  }

  return token.slice(0, cutAt)
}

function normalizeFlagToken(token: string): string | null {
  let t = token.trim()
  if (!t || !t.startsWith('-')) return null

  t = cutFlagArgumentSyntax(t)
  t = t.replace(/[),.:;\]]+$/g, '')

  if (t === '-' || t === '--') return null
  return t
}

export function parseOptionTerms(flags: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const parts = flags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const part of parts) {
    const tokens = part.split(/\s+/g).map((s) => s.trim())

    for (const token of tokens) {
      const normalized = normalizeFlagToken(token)
      if (!normalized) continue
      if (seen.has(normalized)) continue
      seen.add(normalized)
      out.push(normalized)
    }
  }

  return out
}
