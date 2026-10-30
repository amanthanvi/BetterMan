import { portabilityWords } from '../lib/manBrief'
import type { T } from '../lib/i18n/translate'
import type { ManKey } from '../lib/i18n/catalog/en/man'
import type { PlainKey } from '../lib/i18n/lite'

/**
 * The composer's command, without a DOM. The manual's argument notation
 * (`ARCHIVE`, `=FILE`, `[=WHEN]`) is never copied as if it were a value: the
 * reader types each value. An optional argument left empty is dropped
 * (`ls --color`); a required one left empty keeps Copy disabled.
 */
export type ComposePick = {
  flag: string
  /** The manual's notation for the flag's argument, or '' when it takes none. */
  argument: string
  /** Portability cells when the flag is not on all three systems. */
  portability: string | null
  /** Defined under the page's exclusive modes heading (lib/manBrief.ts isModeHeading). */
  mode: boolean
  /** What the reader typed for the argument. */
  value: string
}

export type ArgumentSpec = { name: string; optional: boolean }

/** `ARCHIVE`, `=FILE` → required; `[=WHEN]`, `[WHEN]` → optional. */
export function argumentSpec(notation: string): ArgumentSpec | null {
  let text = notation.trim()
  if (!text) return null
  const optional = /^\[.*\]$/.test(text)
  if (optional) text = text.slice(1, -1).trim()
  text = text.replace(/^=/, '').replace(/^<(.*)>$/, '$1').trim()
  return text ? { name: text, optional } : null
}

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

/** A typed value as one shell word: as is when safe, else single-quoted. */
export function shellWord(value: string): string {
  return SAFE.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`
}

/** Mode flags first, as people type them; otherwise in the order picked. */
export function ordered(picks: ComposePick[]): ComposePick[] {
  return [...picks].sort((a, b) => Number(b.mode) - Number(a.mode))
}

/** The copyable command, or which required values are still missing. */
export function commandText(name: string, picks: ComposePick[]): { text: string; missing: string[] } {
  const words = [name]
  const missing: string[] = []
  for (const pick of ordered(picks)) {
    const spec = argumentSpec(pick.argument)
    const value = pick.value.trim()
    if (!spec) {
      words.push(pick.flag)
    } else if (!value) {
      if (!spec.optional) missing.push(`${spec.name} for ${pick.flag}`)
      words.push(pick.flag)
    } else if (pick.flag.startsWith('--')) {
      // Long options take `=`, which an optional argument requires (`--color=always`).
      words.push(`${pick.flag}=${shellWord(value)}`)
    } else if (spec.optional) {
      // A short option's optional argument must touch it (`-c5`), or it reads as an operand.
      words.push(`${pick.flag}${shellWord(value)}`)
    } else {
      words.push(pick.flag, shellWord(value))
    }
  }
  return { text: words.join(' '), missing }
}

/** Where a flag is not on all three systems, and two exclusive modes picked together. */
export function composerWarnings(picks: ComposePick[], t: T<PlainKey<ManKey>>): string {
  const out: string[] = []
  for (const pick of picks) if (pick.portability) out.push(t('{flag}: {words}.', { flag: pick.flag, words: portabilityWords(pick.portability, t) }))
  const modes = picks.filter((pick) => pick.mode).map((pick) => pick.flag)
  if (modes.length > 1) out.push(t('Choose one mode: {modes} conflict.', { modes: new Intl.ListFormat(t.lang, { style: 'long', type: 'conjunction' }).format(modes) }))
  return out.join(' ')
}
