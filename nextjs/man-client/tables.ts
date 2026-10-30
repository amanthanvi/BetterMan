import { BUTTON, h } from './dom'
import { t, tn } from './i18n'

/**
 * Live reference tables, such as ascii(7): a row lookup that marks and scrolls to
 * matching rows, and sortable columns with a way back to the manual's order. The
 * manual's rows are never hidden (fix 7), only marked or reordered.
 */
const MIN_ROWS = 8
const MATCH = 'bg-wash'

/** A cell's sort key: a number when it reads as one (decimal, 0x hex, 0 octal), else text. */
export function sortKey(text: string): number | string {
  const value = text.trim()
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  if (/^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value.slice(2), 16)
  return value.toLowerCase()
}

export function compareKeys(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a.localeCompare(b)
}

function liven(wrapper: HTMLElement, table: HTMLTableElement, index: number) {
  const body = table.tBodies[0]
  if (!body) return
  const original = [...body.rows]
  const label = t('table {n}', { n: index + 1 })
  const input = h('input', { type: 'search', class: 'bm-field max-w-56 py-1 text-sm', placeholder: t('Find a row'), 'aria-label': t('Find a row in {table}', { table: label }), autocomplete: 'off', spellcheck: 'false' })
  const count = h('span', { class: 'text-xs text-ink-3 tabular-nums', 'aria-live': 'polite' })
  const reset = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.ghost}`, hidden: true }, t('Original order'))
  wrapper.before(h('div', { class: 'bm-js mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-sans', 'data-bm-table-tools': true }, input, count, reset))

  let matches: HTMLTableRowElement[] = []
  let at = 0
  const focusMatch = () => matches[at]?.scrollIntoView({ block: 'nearest' })
  input.addEventListener('input', () => {
    const needle = input.value.trim().toLowerCase()
    matches = []
    for (const row of original) {
      const hit = Boolean(needle) && (row.textContent ?? '').toLowerCase().includes(needle)
      row.classList.toggle(MATCH, hit)
      if (hit) row.setAttribute('data-bm-row-match', '')
      else row.removeAttribute('data-bm-row-match')
    }
    matches = [...body.rows].filter((row) => row.hasAttribute('data-bm-row-match'))
    at = 0
    count.textContent = needle ? tn('{count, plural, one {# row} other {# rows}}', matches.length, `${matches.length} ${matches.length === 1 ? 'row' : 'rows'}`) : ''
    focusMatch()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !matches.length) return
    e.preventDefault()
    at = (at + (e.shiftKey ? matches.length - 1 : 1)) % matches.length
    focusMatch()
  })

  const headers = [...(table.tHead?.rows[0]?.cells ?? [])]
  let sorted: { column: number; direction: 1 | -1 } | null = null
  const sortBy = (column: number) => {
    const direction: 1 | -1 = sorted?.column === column && sorted.direction === 1 ? -1 : 1
    sorted = { column, direction }
    const rows = [...original].sort((a, b) => direction * compareKeys(sortKey(a.cells[column]?.textContent ?? ''), sortKey(b.cells[column]?.textContent ?? '')))
    body.append(...rows)
    headers.forEach((th, i) => th.setAttribute('aria-sort', i === column ? (direction === 1 ? 'ascending' : 'descending') : 'none'))
    reset.hidden = false
    matches = [...body.rows].filter((row) => row.hasAttribute('data-bm-row-match'))
  }
  headers.forEach((th, column) => {
    const button = h('button', { type: 'button', class: 'font-semibold text-inherit underline decoration-rule-2 underline-offset-2 hover:text-accent', title: t('Sort by this column') })
    button.append(...th.childNodes)
    th.replaceChildren(button)
    th.setAttribute('aria-sort', 'none')
    button.addEventListener('click', () => sortBy(column))
  })
  reset.addEventListener('click', () => {
    body.append(...original)
    sorted = null
    headers.forEach((th) => th.setAttribute('aria-sort', 'none'))
    reset.hidden = true
    matches = [...body.rows].filter((row) => row.hasAttribute('data-bm-row-match'))
  })
}

export function initTables() {
  document.querySelectorAll<HTMLElement>('article .bm-manual .bm-tbl').forEach((wrapper, index) => {
    const table = wrapper.querySelector('table')
    if (table && (table.tBodies[0]?.rows.length ?? 0) >= MIN_ROWS) liven(wrapper, table, index)
  })
}
