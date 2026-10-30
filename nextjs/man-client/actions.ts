import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, isBookmarked, toggleBookmark } from '../lib/bookmarks'
import { normalizeDistro } from '../lib/distro'
import { recordRecentPage } from '../lib/recent'
import { icons } from './dom'
import { setDefaultDistro } from './state'

/** The header card's actions, the code copy buttons, the system picker, and the recent-pages entry. */

function pressedFeedback(button: HTMLElement, live: string, title: string, idleTitle: string) {
  const mark = button.querySelector<HTMLElement>('[data-bm-pressed-mark]')
  const region = button.querySelector<HTMLElement>('[aria-live]')
  let timer = 0
  return () => {
    if (mark) mark.hidden = false
    if (region) region.textContent = live
    button.title = title
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (mark) mark.hidden = true
      if (region) region.textContent = ''
      button.title = idleTitle
    }, 2000)
  }
}

function initCopyLink() {
  const button = document.querySelector<HTMLButtonElement>('[data-bm-action="copy-link"]')
  if (!button) return
  const copied = pressedFeedback(button, 'Link copied', 'Copied', 'Copy link')
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      copied()
    } catch {
      // ignore
    }
  })
}

function initCopyCode() {
  document.addEventListener('click', async (e) => {
    const button = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-bm-action="copy-code"]')
    if (!button) return
    const text = button.parentElement?.querySelector('code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    button.title = 'Copied'
    button.replaceChildren(icons.check())
    window.setTimeout(() => {
      button.title = 'Copy'
      button.replaceChildren(icons.copy())
    }, 2000)
  })
}

export function initBookmark(): (() => void) | null {
  const button = document.querySelector<HTMLButtonElement>('[data-bm-action="bookmark"]')
  if (!button) return null
  const page = {
    name: button.dataset.bmBookmarkName ?? '',
    section: button.dataset.bmBookmarkSection ?? '',
    description: button.dataset.bmBookmarkDescription || undefined,
  }
  const key = `${page.name}(${page.section})`
  const mark = button.querySelector<HTMLElement>('[data-bm-pressed-mark]')
  const region = button.querySelector<HTMLElement>('[aria-live]')
  let active = false
  const render = (announce: boolean) => {
    const next = isBookmarked(page)
    if (announce && next !== active && region) region.textContent = next ? `Bookmarked ${key}.` : `Removed bookmark for ${key}.`
    active = next
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute('aria-label', active ? `Remove bookmark for ${key}` : `Bookmark ${key}`)
    button.title = active ? `Bookmarked: ${key} (m)` : `Bookmark: ${key} (m)`
    if (mark) mark.hidden = !active
  }
  const toggle = () => {
    toggleBookmark(page)
    render(true)
  }
  button.addEventListener('click', toggle)
  window.addEventListener(BOOKMARKS_EVENT, () => render(true))
  window.addEventListener('storage', (e) => {
    if (e.key === BOOKMARKS_STORAGE_KEY) render(true)
  })
  render(false)
  return toggle
}

function initDistroSelect() {
  const select = document.querySelector<HTMLSelectElement>('[data-bm-distro-select]')
  if (!select) return
  const served = select.value
  select.addEventListener('change', () => {
    const next = normalizeDistro(select.value)
    if (next) setDefaultDistro(next)
  })
  // A back/forward cache restore shows the page as served.
  window.addEventListener('pageshow', () => {
    select.value = served
  })
}

function recordVisit() {
  const page = document.querySelector<HTMLElement>('[data-bm-manual]')
  if (!page) return
  recordRecentPage({
    name: page.dataset.bmPageName ?? '',
    section: page.dataset.bmPageSection ?? '',
    description: page.dataset.bmPageDescription || undefined,
  })
}

export function initActions() {
  initCopyLink()
  initCopyCode()
  initDistroSelect()
  recordVisit()
}
