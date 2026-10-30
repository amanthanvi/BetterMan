import { getFindA11yStatus } from '../components/man/findA11y'
import { singleKeyShortcutsBlocked } from '../lib/dom'
import { getScrollBehavior, scrollElementIntoView } from '../lib/scroll'
import { escapeRegExp } from '../lib/textRanges'
import { h, ICON_BUTTON, icons } from './dom'
import { t } from './i18n'
import { onRemark, setHighlight } from './highlights'

const FIND_DEBOUNCE_MS = 150
const EXIT_MS = 150

/**
 * Find in page, as the React find bar did: the bar mounts on open and unmounts
 * after its exit animation; matches, the query and the position survive closing,
 * so n and N keep stepping through them, as in less.
 */
let bar: HTMLElement | null = null
let input: HTMLInputElement | null = null
let countEl: HTMLElement | null = null
let statusEl: HTMLElement | null = null
let prevButton: HTMLButtonElement | null = null
let nextButton: HTMLButtonElement | null = null
let open = false
let query = ''
let applied = ''
let activeIndex = 0
let activeMark: Element | null = null
let previouslyFocused: Element | null = null
let debounce = 0
let unmountTimer = 0
let restoreFrame = 0

function matches(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('mark[data-bm-find]')]
}

function label(): string {
  const raw = query.trim()
  if (raw.length < 2) return '—'
  if (raw !== applied) return '…'
  const count = matches().length
  return count ? `${Math.min(activeIndex, count - 1) + 1}/${count}` : '0/0'
}

function renderCount() {
  if (!countEl || !statusEl) return
  const text = label()
  countEl.textContent = text
  statusEl.textContent = getFindA11yStatus(query, text, t)
  const none = !matches().length || query.trim() !== applied
  if (prevButton) prevButton.disabled = none
  if (nextButton) nextButton.disabled = none
}

function setActive(index: number, scroll: boolean) {
  const all = matches()
  activeMark?.classList.remove('bm-find-active')
  activeMark = null
  if (!all.length) return
  activeIndex = ((index % all.length) + all.length) % all.length
  const mark = all[activeIndex]!
  mark.classList.add('bm-find-active')
  activeMark = mark
  if (scroll) scrollElementIntoView(mark, { behavior: getScrollBehavior(), block: 'center' })
  renderCount()
}

function applyQuery() {
  window.clearTimeout(debounce)
  const raw = query.trim()
  applied = raw
  setHighlight('find', raw.length >= 2 ? new RegExp(escapeRegExp(raw), 'gi') : undefined)
  activeIndex = 0
  activeMark = null
  if (matches().length) setActive(0, true)
  renderCount()
}

export function goNext() {
  const count = matches().length
  if (!count) return
  setActive(activeMark?.isConnected ? activeIndex + 1 : Math.min(activeIndex, count - 1), true)
}

export function goPrev() {
  if (!matches().length) return
  setActive(activeIndex - 1, true)
}

function build() {
  input = h('input', {
    name: 'bm-find',
    placeholder: t('Find in page…'),
    class: 'h-9 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-ink-3',
    'aria-label': t('Find in page'),
    autocomplete: 'off',
  })
  input.value = query
  countEl = h('div', { class: 'min-w-[3.5rem] text-center text-xs text-ink-3 tabular-nums' })
  statusEl = h('div', { 'aria-live': 'polite', class: 'sr-only' })
  prevButton = h('button', { type: 'button', class: ICON_BUTTON, 'aria-label': t('Previous match') }, icons.chevron('size-4 rotate-180'))
  nextButton = h('button', { type: 'button', class: ICON_BUTTON, 'aria-label': t('Next match') }, icons.chevron('size-4'))
  const closeButton = h('button', { type: 'button', class: ICON_BUTTON, 'aria-label': t('Close find') }, icons.close('size-4'))
  bar = h('div', { 'data-bm-findbar': true }, h('div', { class: 'flex items-center gap-1.5' }, input, countEl, statusEl, prevButton, nextButton, closeButton))

  input.addEventListener('input', () => {
    query = input!.value
    activeIndex = 0
    activeMark?.classList.remove('bm-find-active')
    activeMark = null
    window.clearTimeout(debounce)
    // A cleared query applies at once; typing settles first.
    if (query.trim().length < 2) applyQuery()
    else debounce = window.setTimeout(applyQuery, FIND_DEBOUNCE_MS)
    renderCount()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !matches().length || query.trim() !== applied) return
    e.preventDefault()
    if (e.shiftKey) goPrev()
    else goNext()
  })
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    closeFind()
  })
  prevButton.addEventListener('click', goPrev)
  nextButton.addEventListener('click', goNext)
  closeButton.addEventListener('click', closeFind)
}

function renderBar() {
  if (!bar) return
  bar.className = `fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 border border-rule-2 bg-raised px-3 py-1.5 shadow-overlay motion-reduce:animate-none sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[4.25rem] sm:w-[24rem] ${
    open ? 'bm-rise-in' : 'bm-rise-out pointer-events-none motion-reduce:invisible'
  }`
  if (open) bar.removeAttribute('aria-hidden')
  else bar.setAttribute('aria-hidden', 'true')
}

export function openFind() {
  window.clearTimeout(unmountTimer)
  if (restoreFrame) {
    // Reopened before focus went back: keep the element the first open came from.
    window.cancelAnimationFrame(restoreFrame)
    restoreFrame = 0
  } else if (!open) {
    previouslyFocused = document.activeElement
  }
  if (!bar) build()
  open = true
  renderBar()
  renderCount()
  if (!bar!.isConnected) document.body.append(bar!)
  input!.focus()
  input!.select()
}

export function closeFind() {
  if (!open) return
  open = false
  activeMark?.classList.remove('bm-find-active')
  renderBar()
  const target = previouslyFocused
  restoreFrame = window.requestAnimationFrame(() => {
    restoreFrame = 0
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true })
  })
  unmountTimer = window.setTimeout(() => {
    if (open || !bar) return
    bar.remove()
    bar = input = countEl = statusEl = prevButton = nextButton = null
  }, EXIT_MS)
}

export function initFind() {
  // Option selection re-marks the manual; keep the current match highlighted.
  onRemark(() => {
    if (!activeMark || activeMark.isConnected) return
    const all = matches()
    activeMark = null
    if (open && all.length) setActive(Math.min(activeIndex, all.length - 1), false)
  })

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key !== 'n' && e.key !== 'N') return
    if (!matches().length || singleKeyShortcutsBlocked(document)) return
    e.preventDefault()
    if (e.key === 'n') goNext()
    else goPrev()
  })
}
