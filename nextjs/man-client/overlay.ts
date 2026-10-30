import { h } from './dom'

/**
 * The overlay chassis of components/ui/Dialog.tsx without React: scrim, focus
 * trap, body scroll lock, Escape, click-outside, and an exit state. The dialog
 * role and aria-modal exist only while open, so single-key shortcuts resume the
 * moment it closes (lib/dom.ts singleKeyShortcutsBlocked).
 */
export type Overlay = {
  root: HTMLElement
  panel: HTMLElement
  open: () => void
  close: () => void
  isOpen: () => boolean
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
}

let locks = 0
let saved: { y: number; overflow: string; position: string; top: string; width: string } | null = null

function lockScroll() {
  if (locks++ > 0) return
  const style = document.body.style
  saved = { y: window.scrollY, overflow: style.overflow, position: style.position, top: style.top, width: style.width }
  style.overflow = 'hidden'
  style.position = 'fixed'
  style.top = `-${saved.y}px`
  style.width = '100%'
}

function unlockScroll() {
  if (locks === 0 || --locks > 0 || !saved) return
  const style = document.body.style
  style.overflow = saved.overflow
  style.position = saved.position
  style.top = saved.top
  style.width = saved.width
  window.scrollTo(0, saved.y)
  saved = null
}

export function createOverlay(opts: {
  label: string
  rootClass: (open: boolean) => string
  scrimClass: (open: boolean) => string
  panelClass: (open: boolean) => string
  exitMs?: number
  /** The palette also hides its closing frame from assistive technology. */
  hideWhenClosing?: boolean
  /** The element to focus on open; otherwise the first focusable, else the panel. */
  initialFocus?: () => HTMLElement | null
  onOpen?: () => void
  onClose?: () => void
}): Overlay {
  const exitMs = opts.exitMs ?? 200
  const scrim = h('div')
  const panel = h('div', { tabindex: -1 })
  const root = h('div', {}, scrim, panel)
  let open = false
  let previouslyFocused: Element | null = null
  let unmountTimer = 0
  let focusFrame = 0

  const render = () => {
    root.className = opts.rootClass(open)
    scrim.className = opts.scrimClass(open)
    panel.className = opts.panelClass(open)
    panel.dataset.state = open ? 'open' : 'closed'
    if (open) {
      root.setAttribute('role', 'dialog')
      root.setAttribute('aria-modal', 'true')
      root.setAttribute('aria-label', opts.label)
      root.removeAttribute('aria-hidden')
    } else {
      root.removeAttribute('role')
      root.removeAttribute('aria-modal')
      root.removeAttribute('aria-label')
      if (opts.hideWhenClosing) root.setAttribute('aria-hidden', 'true')
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    close()
  }

  const onTrapKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = focusables(panel)
    if (!items.length) return
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    const outside = !active || !panel.contains(active)
    if (e.shiftKey && (active === first || outside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || outside)) {
      e.preventDefault()
      first.focus()
    }
  }

  root.addEventListener('click', () => close())
  scrim.addEventListener('click', () => close())
  panel.addEventListener('click', (e) => e.stopPropagation())
  panel.addEventListener('keydown', onTrapKey)

  function openOverlay() {
    window.clearTimeout(unmountTimer)
    if (open) {
      opts.initialFocus?.()?.focus()
      return
    }
    open = true
    // Reopening during the exit animation keeps the focus to restore from the first open.
    if (!root.isConnected) previouslyFocused = document.activeElement
    render()
    if (!root.isConnected) document.body.append(root)
    lockScroll()
    window.addEventListener('keydown', onKeyDown)
    opts.onOpen?.()
    const wanted = opts.initialFocus?.()
    if (wanted) wanted.focus()
    window.cancelAnimationFrame(focusFrame)
    focusFrame = window.requestAnimationFrame(() => {
      if (!open || panel.contains(document.activeElement)) return
      ;(opts.initialFocus?.() ?? focusables(panel)[0] ?? panel).focus()
    })
  }

  function close() {
    if (!open) return
    open = false
    window.cancelAnimationFrame(focusFrame)
    window.removeEventListener('keydown', onKeyDown)
    unlockScroll()
    render()
    opts.onClose?.()
    const target = previouslyFocused
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true })
    unmountTimer = window.setTimeout(() => {
      if (!open) {
        root.remove()
        previouslyFocused = null
      }
    }, exitMs)
  }

  return { root, panel, open: openOverlay, close, isOpen: () => open }
}

/** Classes for components/ui/Dialog.tsx. */
export const DIALOG = {
  rootClass: (open: boolean) => `fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`,
  scrimClass: (open: boolean) => `absolute inset-0 bg-scrim transition-opacity motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`,
  panelClass: (open: boolean) =>
    `relative mx-auto mt-24 max-h-[calc(100dvh-8rem)] w-[min(92vw,38rem)] overflow-y-auto border border-rule-2 bg-raised px-6 py-5 text-ink shadow-overlay motion-reduce:animate-none ${
      open ? 'bm-pop-in' : 'bm-pop-out motion-reduce:invisible'
    }`,
}

const DRAWER_SIDES = {
  left: {
    closed: '-translate-x-full',
    base: 'absolute inset-y-0 left-0 w-[min(88vw,20rem)] border-r border-rule-2 bg-raised text-ink shadow-overlay',
  },
  'sheet-right': {
    closed: 'translate-y-full sm:translate-y-0 sm:translate-x-full',
    base: 'absolute inset-x-0 bottom-0 max-h-[75dvh] border-t border-rule-2 bg-raised text-ink shadow-overlay sm:inset-x-auto sm:top-0 sm:right-0 sm:max-h-none sm:w-[min(92vw,22rem)] sm:border-t-0 sm:border-l',
  },
} as const

/** Classes for components/ui/Drawer.tsx. */
export function drawer(side: keyof typeof DRAWER_SIDES, padding: string) {
  return {
    rootClass: DIALOG.rootClass,
    scrimClass: DIALOG.scrimClass,
    panelClass: (open: boolean) =>
      `${DRAWER_SIDES[side].base} overflow-y-auto transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? 'translate-x-0 translate-y-0' : DRAWER_SIDES[side].closed
      } ${padding}`,
  }
}
