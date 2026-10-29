type Child = Node | string | null | undefined | false
type Attrs = Record<string, string | number | boolean | null | undefined>

/** A small element builder. `true` sets an empty attribute; false, null and undefined omit it. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue
    el.setAttribute(name, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

/** Inline SVG from fixed markup: the same icons as components/icons, which this bundle cannot import (React). */
function icon(paths: string, className: string): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

export const icons = {
  chevron: (className = 'size-4') => icon('<path d="m6 9 6 6 6-6"/>', className),
  close: (className = 'size-4') => icon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', className),
  check: (className = 'size-4') => icon('<path d="M20 6 9 17l-5-5"/>', className),
  copy: (className = 'size-4') =>
    icon('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', className),
}

export function kbd(text: string, className = ''): HTMLElement {
  return h(
    'kbd',
    {
      class: `inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center border border-rule-2 bg-paper px-[0.3em] font-mono text-xs text-ink-2 ${className}`,
    },
    text,
  )
}

/** Button classes from components/ui/Button.tsx. */
export const BUTTON = {
  base: 'inline-flex shrink-0 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-50',
  sm: 'h-8 gap-1.5 text-sm',
  md: 'h-9 gap-2 text-sm',
  outline: 'text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent',
  ghost: 'text-ink-2 hover:text-ink',
}

/** IconButton classes from components/ui/IconButton.tsx (ghost, sm). */
export const ICON_BUTTON = 'inline-flex shrink-0 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-50 text-ink-3 hover:text-ink size-8'

export function announce(region: 'theme' | 'notice' | 'navigation', text: string) {
  const el = document.querySelector<HTMLElement>(`[data-bm-live="${region}"]`)
  if (el) el.textContent = text
}
