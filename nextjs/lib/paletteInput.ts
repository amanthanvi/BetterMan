import { normalizeDistro, type Distro } from './distro'

/** The command palette's input grammar, shared by the App Router palette and the man page script. */
export type PaletteMode = 'search' | 'actions' | 'headings'

export type ParsedSearch = { distro?: Distro; text: string }

export function parsePaletteInput(raw: string): { mode: PaletteMode; text: string } {
  if (raw.startsWith('\\>')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('\\#')) return { mode: 'search', text: raw.slice(2) }
  if (raw.startsWith('>')) return { mode: 'actions', text: raw.slice(1) }
  if (raw.startsWith('#')) return { mode: 'headings', text: raw.slice(1) }
  return { mode: 'search', text: raw }
}

export function parseSearchText(raw: string): ParsedSearch {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('@')) return { text: trimmed }

  const spaceIdx = trimmed.indexOf(' ')
  const token = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).slice(1)
  const distro = normalizeDistro(token)
  if (!distro) return { text: trimmed }

  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)
  return { distro, text: rest.trim() }
}
