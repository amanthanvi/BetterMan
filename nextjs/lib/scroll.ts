export function getScrollBehavior(): 'auto' | 'smooth' {
  if (typeof window === 'undefined') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * Scroll on the next frame so hash-driven option expansion has committed.
 * Retries also cover anchors arriving through a streamed server document.
 */
export function scrollToIdWhenRendered(
  id: string,
  opts: { behavior: ScrollBehavior; block: ScrollLogicalPosition; attempts?: number },
): void {
  const maxAttempts = opts.attempts ?? 20
  let attempts = 0

  const tick = () => {
    attempts += 1
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: opts.behavior, block: opts.block })
      return
    }
    if (attempts < maxAttempts) window.requestAnimationFrame(tick)
  }

  window.requestAnimationFrame(tick)
}
