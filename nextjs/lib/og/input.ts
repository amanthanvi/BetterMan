import { isManName } from '../shortUrl'
const MAN_SECTION_PATTERN = /^[0-9][a-zA-Z0-9]{0,7}$/

export function isValidManImageParams(name: string, section: string): boolean {
  return name.trim() === name && section.trim() === section && isManName(name) && MAN_SECTION_PATTERN.test(section)
}

// C0/C1 controls, and the bidi embeddings, overrides and isolates that could reorder a card's text.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g

/** Card text is plain text: no controls or direction overrides, whitespace collapsed. */
export function plainOgText(value: string): string {
  return value.replace(UNSAFE_TEXT, ' ').replace(/\s+/g, ' ').trim()
}

/** Cuts at a code point, never inside a surrogate pair. */
export function truncateOgText(value: string, maxLength: number): string {
  const points = [...value]
  return points.length > maxLength ? `${points.slice(0, maxLength - 1).join('').trimEnd()}…` : value
}
