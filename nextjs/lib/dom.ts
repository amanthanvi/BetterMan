export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range'].includes(el.type)
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement) return el.isContentEditable
  return false
}

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog'
const OPEN_MODAL_SELECTOR = '[aria-modal="true"], dialog[open]'

/**
 * Page-level single-key shortcuts (`d`, `/`, `?`, …) must stay out of the way
 * while the user is typing, while focus is inside any dialog, and while any
 * modal is open even if focus has drifted outside it.
 */
export function singleKeyShortcutsBlocked(doc: Document): boolean {
  const active = doc.activeElement
  if (isTypingTarget(active)) return true
  if (active?.closest(DIALOG_SELECTOR)) return true
  return doc.querySelector(OPEN_MODAL_SELECTOR) !== null
}
