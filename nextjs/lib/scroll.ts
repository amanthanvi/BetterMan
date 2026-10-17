export function getScrollBehavior(): 'auto' | 'smooth' {
  if (typeof window === 'undefined') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Virtualized blocks mount a few frames after the virtualizer scrolls, so retry until the target exists. */
export function scrollToIdWhenRendered(id: string, opts: { behavior: ScrollBehavior; block: ScrollLogicalPosition }) {
  let attempts = 0

  const tick = () => {
    attempts += 1
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: opts.behavior, block: opts.block })
      return
    }
    if (attempts < 20) window.requestAnimationFrame(tick)
  }

  window.requestAnimationFrame(tick)
}
