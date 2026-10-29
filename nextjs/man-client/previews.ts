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
const cache = new Map<string, Promise<MetaOutcome>>()
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

// A failed read (429, 5xx, offline) is not remembered as "no page": it is
// retried, but not more often than this, however often the link is hovered.
const RETRY_MS = 30_000
const failedAt = new Map<string, number>()

/** `undefined` while unavailable (a failure, within its back-off); `null` for a page that does not exist. */
export type MetaOutcome = Meta | undefined

/** Only a page (200) or its absence (404) is cached for the page view; anything else is evicted. */
/** Test seam: forget cached previews and failures. */
export function resetPreviews() {
  cache.clear()
  failedAt.clear()
}

export async function readMeta(url: string, fetcher: typeof fetch = fetch): Promise<{ meta: MetaOutcome; cache: boolean }> {
  try {
    const res = await fetcher(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return { meta: null, cache: true }
    if (!res.ok) return { meta: undefined, cache: false }
    const { page } = (await res.json()) as { page?: { name?: string; section?: string; description?: string; title?: string } }
    if (!page?.name) return { meta: undefined, cache: false }
    return { meta: { name: page.name, section: page.section ?? '', description: page.description || page.title || '' }, cache: true }
  } catch {
    return { meta: undefined, cache: false }
  }
}

export function loadMeta(url: string): Promise<MetaOutcome> {
  const cached = cache.get(url)
  if (cached) return cached
  const last = failedAt.get(url)
  if (last !== undefined && Date.now() - last < RETRY_MS) return Promise.resolve(undefined)
  const pending = readMeta(url).then(({ meta, cache: keep }) => {
    if (!keep) {
      cache.delete(url)
      failedAt.set(url, Date.now())
    } else {
      failedAt.delete(url)
    }
    return meta
  })
  cache.set(url, pending)
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
  const meta = await loadMeta(url)
  if (current !== link || !card) return
  card.replaceChildren(
    ...(meta === undefined
      ? [h('p', { class: 'text-ink-3' }, 'Preview unavailable right now.')]
      : meta
      ? [
          h('p', { class: 'font-serif text-base text-ink' }, h('b', { class: 'font-semibold' }, meta.name), `(${meta.section})`),
          meta.description ? h('p', { class: 'text-ink-2' }, meta.description) : null,
        ].filter((node): node is HTMLParagraphElement => Boolean(node))
      : [h('p', { class: 'text-ink-3' }, 'No page by this name in this edition.')]),
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
