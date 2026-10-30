import { SIDEBAR_CLOSED_COLUMNS, SIDEBAR_OPEN_COLUMNS } from '../components/man/sidebarColumns'
import { getScrollBehavior, scrollToIdWhenRendered } from '../lib/scroll'
import { BUTTON, h } from './dom'
import { createOverlay, drawer, type Overlay } from './overlay'
import { t } from './i18n'

/** The contents: the sticky sidebar from lg, a drawer below it, the active section, and its marker. */
export type TocItem = { id: string; level: number; title: string }

const ACTIVE = 'font-semibold text-ink'
const IDLE = 'text-ink-3 hover:text-ink'

let sidebarOpen = true
let drawerOverlay: Overlay | null = null
let activeId: string | null = null

export function tocItems(): TocItem[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('[data-bm-sidebar] nav[data-bm-toc] a[href^="#"]')].map((a) => ({
    id: decodeURIComponent(a.hash.slice(1)),
    level: Number(a.dataset.bmLevel ?? 2),
    title: a.title || a.lastElementChild?.textContent || a.textContent || '',
  }))
}

function navs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('nav[data-bm-toc]')]
}

function swap(el: Element, remove: string, add: string) {
  el.classList.remove(...remove.split(' '))
  el.classList.add(...add.split(' '))
}

function placeMarker(nav: HTMLElement) {
  const list = nav.querySelector('ol')
  const wrapper = list?.parentElement
  if (!list || !wrapper) return
  let marker = wrapper.querySelector<HTMLElement>('.bm-toc-marker')
  const link = list.querySelector<HTMLElement>('a[aria-current="location"]')
  if (!link) {
    marker?.remove()
    return
  }
  if (!marker) {
    // Beside the list, not in it: an <ol> holds only <li>.
    marker = h('span', { 'aria-hidden': 'true', class: 'bm-toc-marker pointer-events-none absolute left-0 top-0 w-0.5 bg-accent' })
    wrapper.prepend(marker)
  }
  marker.style.transform = `translateY(${link.offsetTop}px)`
  marker.style.height = `${link.offsetHeight}px`
}

export function setActiveSection(id: string | null) {
  activeId = id
  for (const nav of navs()) {
    for (const link of nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const active = decodeURIComponent(link.hash.slice(1)) === id
      if (active) {
        link.setAttribute('aria-current', 'location')
        swap(link, IDLE, ACTIVE)
      } else if (link.hasAttribute('aria-current')) {
        link.removeAttribute('aria-current')
        swap(link, ACTIVE, IDLE)
      }
    }
    placeMarker(nav)
  }
}

export function scrollToSection(id: string) {
  setActiveSection(id)
  scrollToIdWhenRendered(id, { behavior: getScrollBehavior(), block: 'start' })
}

function bindNav(nav: HTMLElement, onNavigate?: () => void) {
  nav.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const down = e.key === 'ArrowDown' || e.key.toLowerCase() === 'j'
    const up = e.key === 'ArrowUp' || e.key.toLowerCase() === 'k'
    if (!down && !up) return
    // Handled here, so the page's j/k scroll skips it (defaultPrevented).
    e.preventDefault()
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
    if (!links.length) return
    const index = links.findIndex((l) => l === document.activeElement)
    links[index === -1 ? 0 : (index + (down ? 1 : -1) + links.length) % links.length]?.focus()
  })
  nav.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const id = decodeURIComponent(link.hash.slice(1))
    try {
      window.location.hash = id
    } catch {
      // ignore
    }
    scrollToSection(id)
    onNavigate?.()
  })
}

function setSidebar(open: boolean) {
  sidebarOpen = open
  const layout = document.querySelector('[data-bm-layout]')
  if (layout) swap(layout, open ? SIDEBAR_CLOSED_COLUMNS : SIDEBAR_OPEN_COLUMNS, open ? SIDEBAR_OPEN_COLUMNS : SIDEBAR_CLOSED_COLUMNS)
  const expanded = document.querySelector<HTMLElement>('[data-bm-sidebar-open]')
  const collapsed = document.querySelector<HTMLElement>('[data-bm-sidebar-closed]')
  if (expanded) expanded.hidden = !open
  if (collapsed) collapsed.hidden = open
  if (open && activeId) setActiveSection(activeId)
}

function openDrawer() {
  const source = document.querySelector<HTMLElement>('[data-bm-sidebar] nav[data-bm-toc]')
  if (!source) return
  if (!drawerOverlay) {
    drawerOverlay = createOverlay({ label: t('Table of contents'), ...drawer('left', 'p-5') })
    const close = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}` }, t('Close'))
    close.addEventListener('click', () => drawerOverlay?.close())
    const nav = source.cloneNode(true) as HTMLElement
    nav.querySelector('.bm-toc-marker')?.remove()
    bindNav(nav, () => drawerOverlay?.close())
    drawerOverlay.panel.append(
      h('div', { class: 'flex items-center justify-between' }, h('h2', { class: 'small-caps text-lg font-semibold text-ink' }, t('Contents')), close),
      h('div', { class: 'sr-only' }, t('Jump to a section in this man page.')),
      h('div', { class: '-ml-3.5 mt-4' }, nav),
    )
  }
  drawerOverlay.open()
  setActiveSection(activeId)
}

export function toggleContents() {
  if (window.matchMedia('(min-width: 1024px)').matches) setSidebar(!sidebarOpen)
  else if (drawerOverlay?.isOpen()) drawerOverlay.close()
  else openDrawer()
}

function trackActiveSection(items: TocItem[]) {
  const els = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => Boolean(el))
  if (!els.length || typeof IntersectionObserver === 'undefined') return
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const target = visible[0]?.target
      if (target instanceof HTMLElement && target.id) setActiveSection(target.id)
    },
    { root: null, threshold: [0, 1], rootMargin: '-20% 0px -70% 0px' },
  )
  for (const el of els) observer.observe(el)
}

/** Swipe in from the left edge to open the contents on a phone. */
function bindSwipe() {
  let tracking = false
  let opened = false
  let startX = 0
  let startY = 0
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return
    startX = e.touches[0]!.clientX
    startY = e.touches[0]!.clientY
    tracking = startX <= 40
    opened = false
  }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (!tracking || opened || window.matchMedia('(min-width: 1024px)').matches) return
    const dx = e.touches[0]!.clientX - startX
    const dy = e.touches[0]!.clientY - startY
    if (dx > 72 && Math.abs(dy) < 36) {
      opened = true
      tracking = false
      openDrawer()
    }
  }, { passive: true })
  const end = () => {
    tracking = false
    opened = false
  }
  window.addEventListener('touchend', end, { passive: true })
  window.addEventListener('touchcancel', end, { passive: true })
}

export function initToc() {
  const items = tocItems()
  if (!items.length) return
  const sidebarNav = document.querySelector<HTMLElement>('[data-bm-sidebar] nav[data-bm-toc]')
  if (sidebarNav) bindNav(sidebarNav)
  document.querySelector('[data-bm-action="collapse-sidebar"]')?.addEventListener('click', () => setSidebar(false))
  document.querySelector('[data-bm-action="expand-sidebar"]')?.addEventListener('click', () => setSidebar(true))
  document.querySelector('[data-bm-action="contents"]')?.addEventListener('click', openDrawer)
  setActiveSection(items[0]!.id)
  trackActiveSection(items)
  bindSwipe()
}
