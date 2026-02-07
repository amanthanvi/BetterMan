'use client'

export function parseOptionTerms(flags: string): string[] {
  const terms = flags
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => s.split(/\s+/g).map((x) => x.trim()))
    .filter(Boolean)
    .filter((t) => t.startsWith('-'))

  return Array.from(new Set(terms))
}

