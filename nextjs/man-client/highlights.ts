import { applyMarks } from './marks'

/** The find query and the selected option both mark the manual; each change re-marks it with both. */
const spec: { find?: RegExp; option?: RegExp } = {}
const listeners = new Set<() => void>()

export function manualRoot(): Element | null {
  return document.querySelector('article .bm-manual')
}

export function setHighlight(kind: 'find' | 'option', regex: RegExp | undefined) {
  spec[kind] = regex
  const root = manualRoot()
  if (root) applyMarks(root, { ...spec })
  for (const listener of listeners) listener()
}

/** Called after every re-mark, which replaces the mark elements. */
export function onRemark(listener: () => void) {
  listeners.add(listener)
}
