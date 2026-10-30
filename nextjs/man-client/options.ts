import { buildOptionRegex, parseOptionTerms } from '../components/man/find'
import { OPTION_LINK_IDLE, OPTION_LINK_SELECTED } from '../components/man/optionRowClasses'
import { cancelScrollPin, getScrollBehavior, scrollToIdWhenRendered } from '../lib/scroll'
import { BUTTON, h } from './dom'
import { setHighlight } from './highlights'
import { t, tn } from './i18n'

const FLASH_MS = 1400

type Target = { link: HTMLAnchorElement; targetId: string; isRow: boolean }

let selected: HTMLAnchorElement | null = null
let banner: HTMLElement | null = null
let flashTimer = 0
const targets = new Map<string, Target>()

/** "Highlighting <terms>": the terms stand in the catalog's sentence, wherever the language puts them. */
function highlightingParts(terms: string): Array<string | HTMLElement> {
  const marker = '\uE000'
  return t('Highlighting {terms}', { terms: marker })
    .split(marker)
    .flatMap((part, index) => (index ? [h('span', { class: 'font-mono font-bold text-ink' }, terms), part] : [part]))
}

function links(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('[data-bm-options] a[data-bm-anchor]')]
}

function swapClasses(el: Element, remove: string, add: string) {
  el.classList.remove(...remove.split(' '))
  el.classList.add(...add.split(' '))
}

function flash(link: HTMLAnchorElement) {
  for (const row of document.querySelectorAll('tr.bm-option-flash')) row.classList.remove('bm-option-flash')
  const row = link.closest('tr')
  if (!row) return
  // Restart the animation when the same row flashes again.
  void row.getBoundingClientRect()
  row.classList.add('bm-option-flash')
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => row.classList.remove('bm-option-flash'), FLASH_MS)
}

function renderBanner(terms: string[]) {
  banner?.remove()
  banner = null
  if (!terms.length) return
  const clear = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.ghost}` }, t('options.clear\u0004Clear'))
  clear.addEventListener('click', () => select(null))
  banner = h(
    'div',
    { class: 'mb-8 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-2 text-sm text-ink-3' },
    h('p', { class: 'min-w-0' }, ...highlightingParts(terms.join(' '))),
    clear,
  )
  document.querySelector('[data-bm-options]')?.before(banner)
}

/** Selects an option (marks its flags in the manual) or clears the selection. */
function select(link: HTMLAnchorElement | null) {
  if (selected) swapClasses(selected, OPTION_LINK_SELECTED, OPTION_LINK_IDLE)
  selected = link
  if (link) swapClasses(link, OPTION_LINK_IDLE, OPTION_LINK_SELECTED)
  const terms = link ? parseOptionTerms(link.dataset.bmFlags ?? '') : []
  renderBanner(terms)
  setHighlight('option', buildOptionRegex(terms))
}

/** `#<anchorId>` lands on the body definition (or the row, if the body has none); `#<row id>` on the row. Both select. */
function applyHash(): boolean {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return false
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // keep the raw fragment
  }
  const target = targets.get(raw) ?? targets.get(decoded)
  if (!target) return false
  const details = target.link.closest('details')
  if (details && !details.open) details.open = true
  select(target.link)
  flash(target.link)
  scrollToIdWhenRendered(target.targetId, { behavior: getScrollBehavior(), block: target.isRow ? 'center' : 'start' })
  return true
}

/** A heading or other fragment: keep it at the header offset while late layout settles. */
function applyFragment() {
  if (applyHash()) return
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return
  try {
    scrollToIdWhenRendered(decodeURIComponent(raw), { behavior: 'auto', block: 'start' })
  } catch {
    // ignore bad URI sequences
  }
}

function initFilter() {
  const section = document.querySelector<HTMLElement>('[data-bm-options]')
  const input = section?.querySelector<HTMLInputElement>('[data-bm-options-filter]') ?? null
  const portable = section?.querySelector<HTMLInputElement>('[data-bm-options-portable]') ?? null
  if (!section || (!input && !portable)) return
  const count = section.querySelector<HTMLElement>('[data-bm-options-count]')
  const empty = section.querySelector<HTMLElement>('[data-bm-options-empty]')
  const details = section.querySelector('details')
  const summary = details?.querySelector('summary')
  const rows = links().map((link) => {
    const row = link.closest('tr')!
    const argument = link.querySelector('[data-bm-option-argument]')?.textContent?.trim() ?? ''
    const description = row.querySelector('[data-bm-option-description]')?.textContent ?? ''
    return { row, portable: row.hasAttribute('data-bm-portable'), text: `${link.dataset.bmFlags ?? ''} ${argument} ${description}`.toLowerCase() }
  })
  const total = rows.length
  let detailsWasOpen = details?.open ?? false

  const apply = () => {
    const needle = input?.value.trim().toLowerCase() ?? ''
    const portableOnly = Boolean(portable?.checked)
    const filtering = Boolean(needle) || portableOnly
    let shown = 0
    for (const { row, portable: isPortable, text } of rows) {
      const visible = (!needle || text.includes(needle)) && (!portableOnly || isPortable)
      row.hidden = !visible
      if (visible) shown++
    }
    if (details && summary) {
      // Filtering lists every match, the collapsed rest included; clearing restores the disclosure.
      if (filtering && !summary.hidden) {
        detailsWasOpen = details.open
        details.open = true
      } else if (!filtering && summary.hidden) {
        details.open = detailsWasOpen
      }
      summary.hidden = filtering
    }
    if (empty) empty.hidden = !filtering || shown > 0
    if (count) count.textContent = filtering ? t('{shown} of {total}', { shown, total }) : tn('{count, plural, one {# option} other {# options}}', total, `${total} options`)
  }
  input?.addEventListener('input', apply)
  portable?.addEventListener('change', apply)
  // A restored form state (back/forward) filters as it shows.
  if (input?.value || portable?.checked) apply()
}

export function initOptions() {
  for (const link of links()) {
    const rowId = link.id
    const anchorId = link.dataset.bmAnchor ?? ''
    targets.set(rowId, { link, targetId: rowId, isRow: true })
    if (!targets.has(anchorId)) {
      const inBody = Boolean(document.getElementById(anchorId)?.closest('.bm-manual'))
      targets.set(anchorId, { link, targetId: inBody ? anchorId : rowId, isRow: !inBody })
    }

    link.addEventListener('click', (event) => {
      // Modified and non-primary clicks keep the browser's link behavior (new tab, window, download).
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      // pushState is the navigation; the browser's own hash navigation would repeat it.
      event.preventDefault()
      cancelScrollPin()
      select(selected === link ? null : link)
      try {
        window.history.pushState(null, '', `#${rowId}`)
      } catch {
        try {
          window.location.hash = rowId
        } catch {
          // ignore
        }
      }
      flash(link)
      link.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' })
    })
  }

  initFilter()
  applyFragment()
  window.addEventListener('hashchange', applyFragment)
}
