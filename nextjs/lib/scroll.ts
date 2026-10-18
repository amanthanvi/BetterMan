export function getScrollBehavior(): 'auto' | 'smooth' {
  if (typeof window === 'undefined') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

// Input that means the reader has taken over scrolling.
export const READER_INPUT_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

// Late layout shifts land within seconds; a longer pin would fight scrolling that
// raises none of these events (screen readers, switch control, browser-menu find).
const PIN_MAX_MS = 8000

let cancelActive: (() => void) | null = null

export function cancelScrollPin() {
  cancelActive?.()
}

/**
 * Scroll on a later frame, after AppShell's mount scroll and after a hash-driven
 * options expansion commits. Retry while the target has not rendered yet.
 *
 * Content above the target can resize after this scroll (lazy syntax highlighting,
 * font swaps), so keep the target pinned while the page resizes, for a few seconds
 * or until the reader scrolls or another scroll starts.
 */
export function scrollToIdWhenRendered(id: string, opts: { behavior: ScrollBehavior; block: ScrollLogicalPosition }) {
  cancelActive?.()

  let attempts = 0
  let frame = 0
  let observer: ResizeObserver | null = null

  const stop = () => {
    window.cancelAnimationFrame(frame)
    observer?.disconnect()
    for (const type of READER_INPUT_EVENTS) window.removeEventListener(type, stop)
    if (cancelActive === stop) cancelActive = null
  }
  cancelActive = stop
  for (const type of READER_INPUT_EVENTS) window.addEventListener(type, stop, { passive: true })

  const scroll = (behavior: ScrollBehavior) =>
    document.getElementById(id)?.scrollIntoView({ behavior, block: opts.block })

  const tick = () => {
    attempts += 1
    if (document.getElementById(id)) {
      scroll(opts.behavior)
      const pinnedAt = performance.now()
      let height = document.body.offsetHeight
      observer = new ResizeObserver(() => {
        if (performance.now() - pinnedAt > PIN_MAX_MS) return stop()
        // observe() reports the current size once; only a changed height is a shift.
        if (document.body.offsetHeight === height) return
        height = document.body.offsetHeight
        scroll('auto')
      })
      observer.observe(document.body)
      return
    }
    if (attempts < 20) frame = window.requestAnimationFrame(tick)
    else stop()
  }

  frame = window.requestAnimationFrame(tick)
}
