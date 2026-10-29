import { h } from './dom'

/**
 * Cross-reference previews: a link to another man page shows that page's
 * name(section) and one-line description on hover or keyboard focus, from the
 * cached `meta` endpoint. The card is a tooltip, so it describes the link and
 * never takes focus; Escape dismisses it.
 */
type Meta = { name: string; section: string; description: string } | null

const SHOW_MS = 220
const HIDE_MS = 160
const cache = new Map<string, Promise<Meta>>()
let card: HTMLElement | null = null
let current: HTMLAnchorElement | null = null
let showTimer = 0
let hideTimer = 0

/** `/man/<name>/<section>[?distro=]` to its meta endpoint; null for anything else. */
export function metaUrl(href: string): string | null {
  const url = new URL(href, 'https://betterman.invalid')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== 'man') return null
  const distro = url.searchParams.get('distro')
  return `/api/v1/man/${parts[1]}/${parts[2]}/meta${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`
}

function load(url: string): Promise<Meta> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) return null
        const { page } = (await res.json()) as { page?: { name?: string; section?: string; description?: string; title?: string } }
        return page?.name ? { name: page.name, section: page.section ?? '', description: page.description || page.title || '' } : null
      })
      .catch(() => {
        // A failed read may succeed on the next hover.
        cache.delete(url)
        return null
      })
    cache.set(url, pending)
  }
  return pending
}

function position(link: HTMLElement) {
  if (!card) return
  const r = link.getBoundingClientRect()
  const w = card.offsetWidth
  const hgt = card.offsetHeight
  const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12))
  let top = r.bottom + 8
  if (top + hgt > window.innerHeight - 8 && r.top - hgt - 8 > 0) top = r.top - hgt - 8
  card.style.left = `${left}px`
  card.style.top = `${top}px`
}

function hide() {
  window.clearTimeout(showTimer)
  if (card) card.hidden = true
  current?.removeAttribute('aria-describedby')
  current = null
}

async function show(link: HTMLAnchorElement) {
  const url = metaUrl(link.href)
  if (!url) return
  if (!card) {
    card = h('div', { id: 'bm-xref-preview', role: 'tooltip', class: 'fixed z-40 w-max max-w-[min(24rem,calc(100vw-1.5rem))] border border-rule-2 bg-raised px-3 py-2 text-sm shadow-overlay', hidden: true })
    card.addEventListener('mouseenter', () => window.clearTimeout(hideTimer))
    card.addEventListener('mouseleave', () => {
      hideTimer = window.setTimeout(hide, HIDE_MS)
    })
    document.body.append(card)
  }
  current?.removeAttribute('aria-describedby')
  current = link
  card.replaceChildren(h('p', { class: 'text-ink-3' }, 'Loading…'))
  card.hidden = false
  link.setAttribute('aria-describedby', 'bm-xref-preview')
  position(link)
  const meta = await load(url)
  if (current !== link || !card) return
  card.replaceChildren(
    ...(meta
      ? [
          h('p', { class: 'font-serif text-base text-ink' }, h('b', { class: 'font-semibold' }, meta.name), `(${meta.section})`),
          meta.description ? h('p', { class: 'text-ink-2' }, meta.description) : null,
        ].filter((node): node is HTMLParagraphElement => Boolean(node))
      : [h('p', { class: 'text-ink-3' }, 'No preview for this page.')]),
  )
  position(link)
}

function previewLink(target: EventTarget | null): HTMLAnchorElement | null {
  const link = (target as Element | null)?.closest?.('a[href]')
  if (!(link instanceof HTMLAnchorElement) || !link.closest('article') || link.closest('[data-bm-options]')) return null
  return metaUrl(link.href) && new URL(link.href).origin === window.location.origin ? link : null
}

export function initPreviews() {
  document.addEventListener('mouseover', (e) => {
    const link = previewLink(e.target)
    if (!link || link === current) return
    window.clearTimeout(showTimer)
    window.clearTimeout(hideTimer)
    showTimer = window.setTimeout(() => void show(link), SHOW_MS)
  })
  document.addEventListener('mouseout', (e) => {
    const link = previewLink(e.target)
    if (!link) return
    const to = e.relatedTarget as Node | null
    if (to && (link.contains(to) || card?.contains(to))) return
    window.clearTimeout(showTimer)
    hideTimer = window.setTimeout(hide, HIDE_MS)
  })
  document.addEventListener('focusin', (e) => {
    const link = previewLink(e.target)
    if (link) void show(link)
  })
  document.addEventListener('focusout', (e) => {
    if (previewLink(e.target)) hide()
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) hide()
  })
  window.addEventListener('scroll', () => {
    if (current) position(current)
  }, { passive: true })
}
