import { trackEvent } from '../lib/analytics'
import type { SearchResponse, SearchResult } from '../lib/api'
import { BOOKMARKS_EVENT, BOOKMARKS_STORAGE_KEY, getBookmarks } from '../lib/bookmarks'
import { isTypingTarget } from '../lib/dom'
import { manPageHref, withDistro, type Distro } from '../lib/distro'
import { parsePaletteInput, parseSearchText } from '../lib/paletteInput'
import { clearRecent, getRecent, recordRecentSearch } from '../lib/recent'
import { getScrollBehavior } from '../lib/scroll'
import { h, kbd } from './dom'
import { t, tn, urlLang } from './i18n'
import { createOverlay, type Overlay } from './overlay'
import { cycleTheme, preferredDistro, showNavigating, urlDistro } from './state'
import { tocItems } from './toc'

/**
 * components/palette/CommandPalette.tsx without React: search (`@distro`
 * prefix), `>` actions and `#` headings, with recent pages and bookmarks when
 * empty. The input keeps its text between opens, as before.
 */
type Item = {
  id: string
  /** What `>` filters actions by. */
  text?: string
  label: () => HTMLElement
  badge?: string
  detail?: string
  bookmarked?: boolean
  run: () => void
}

const SYMBOL_BADGE: Record<NonNullable<SearchResult['symbolKind']>, string> = {
  config: t('directive'),
  environment: t('environment'),
  files: t('file'),
  errors: t('errno'),
  subcommand: t('subcommand'),
  shell: t('shell'),
}

let overlay: Overlay | null = null
let input: HTMLInputElement
let modeHint: HTMLElement
let live: HTMLElement
let status: HTMLElement
let list: HTMLElement
let items: Item[] = []
let activeIndex = 0
let search: { status: 'idle' | 'loading' | 'error' | 'success'; data?: SearchResponse } = { status: 'idle' }
let debounce = 0
let controller: AbortController | null = null

/** The distro a bare URL shows: the stored default, which the proxy redirects to, else Debian. */
function shownDistro(): Distro {
  return urlDistro() ?? 'debian'
}

function navigate(href: string) {
  showNavigating()
  window.location.assign(href)
}

function close() {
  overlay?.close()
}

function context() {
  const parsed = parsePaletteInput(input.value)
  const parsedSearch = parsed.mode === 'search' ? parseSearchText(parsed.text) : { text: parsed.text.trim() }
  const effectiveDistro = parsed.mode === 'search' && parsedSearch.distro ? parsedSearch.distro : shownDistro()
  // Navigation carries an `@distro` token, else the current URL's own `?distro=`.
  const linkDistro = parsed.mode === 'search' && parsedSearch.distro ? parsedSearch.distro : urlDistro()
  return { parsed, parsedSearch, effectiveDistro, linkDistro }
}

function runSearch(q: string, distroOverride?: Distro) {
  const query = q.trim()
  if (!query) return
  recordRecentSearch(query)
  close()
  navigate(withDistro(`/search?q=${encodeURIComponent(query)}`, distroOverride ?? context().linkDistro, urlLang()))
}

function runMan(name: string, section: string, distroOverride?: Distro, anchorId?: string) {
  const targetDistro = distroOverride ?? context().linkDistro
  const samePage =
    anchorId !== undefined &&
    (targetDistro ?? preferredDistro()) === shownDistro() &&
    decodeURIComponent(window.location.pathname).toLowerCase() === `/man/${name}/${section}`.toLowerCase()
  close()
  if (samePage) {
    // Already here: the hash handler selects and scrolls to the option row.
    if (window.location.hash === `#${anchorId}`) window.dispatchEvent(new HashChangeEvent('hashchange'))
    else window.location.hash = anchorId
    return
  }
  navigate(manPageHref(name, section, targetDistro, anchorId, urlLang()))
}

function pageLabel(name: string, section: string) {
  return () => h('div', { class: 'min-w-0 shrink-0 text-ink font-serif text-base' }, `${name}(${section})`)
}

function textLabel(prefix: string, text: string) {
  return () => h('div', { class: 'min-w-0 shrink-0 text-ink text-sm' }, prefix ? h('span', { 'aria-hidden': 'true' }, prefix) : null, text)
}

function actions(): Item[] {
  const { linkDistro } = context()
  const action = (id: string, label: string, run: () => void, detail?: string): Item => ({ id, text: label, label: textLabel('> ', label), detail, run })
  return [
    action('action-theme', t('Toggle theme'), () => cycleTheme(), t('Cycle: system → light → dark')),
    action('action-home', t('Go home'), () => {
      close()
      navigate(withDistro('/', linkDistro, urlLang()))
    }),
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((s) =>
      action(`action-section-${s}`, t('Go to section {section}', { section: s }), () => {
        close()
        navigate(withDistro(`/section/${encodeURIComponent(s)}`, linkDistro, urlLang()))
      }),
    ),
    action('action-clear-recent', t('Clear recent history'), () => {
      clearRecent()
      input.value = ''
      activeIndex = 0
      update()
    }),
  ]
}

function buildItems(): Item[] {
  const { parsed, parsedSearch } = context()
  const bookmarks = new Set(getBookmarks().items.map((b) => `${b.name}:${b.section}`))

  if (parsed.mode === 'actions') {
    const q = parsed.text.trim().toLowerCase()
    return q ? actions().filter((a) => a.text!.toLowerCase().includes(q)) : actions()
  }

  if (parsed.mode === 'headings') {
    const q = parsed.text.trim().toLowerCase()
    const headings = tocItems()
    return (q ? headings.filter((t) => t.title.toLowerCase().includes(q)) : headings).slice(0, 30).map((t) => ({
      id: `heading:${t.id}`,
      label: textLabel('# ', t.title),
      run: () => {
        document.getElementById(t.id)?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' })
        window.location.hash = t.id
        close()
      },
    }))
  }

  if (!parsedSearch.text) {
    const seen = new Set<string>()
    const out: Item[] = []
    for (const r of getRecent().slice(0, 12)) {
      if (r.kind === 'search') {
        out.push({ id: `search:${r.query}`, label: textLabel('', t('Search: {query}', { query: r.query })), run: () => runSearch(r.query, parseSearchText(r.query).distro) })
        continue
      }
      const key = `${r.name}:${r.section}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: `page:${key}`, label: pageLabel(r.name, r.section), detail: r.description ?? '', bookmarked: bookmarks.has(key), run: () => runMan(r.name, r.section) })
    }
    for (const b of getBookmarks().items.slice(0, 10)) {
      const key = `${b.name}:${b.section}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: `bookmark:${key}`, label: pageLabel(b.name, b.section), detail: b.description ?? '', bookmarked: true, run: () => runMan(b.name, b.section) })
    }
    return out
  }

  // Until the debounced query lands, the previous results stay up, as before.
  if (search.status !== 'success' || !search.data) return []
  return resultItems(search.data, bookmarks)
}

function resultItems(data: SearchResponse, bookmarks: Set<string>): Item[] {
  const query = context().parsed.text.trim()
  return data.results.map((result) => {
    const key = `${result.name}:${result.section}`
    return {
      id: `page:${key}`,
      label: pageLabel(result.name, result.section),
      badge: result.anchorId || result.symbolKind ? result.match === 'option' ? t('flag') : result.symbolKind ? SYMBOL_BADGE[result.symbolKind] : t('definition') : undefined,
      detail: result.description,
      bookmarked: bookmarks.has(key),
      run: () => {
        recordRecentSearch(query)
        runMan(result.name, result.section, undefined, result.anchorId)
      },
    }
  })
}

function render() {
  const { parsed, parsedSearch } = context()
  const text = parsed.mode === 'search' ? parsedSearch.text : parsed.text.trim()
  const safeIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0

  modeHint.textContent = parsed.mode === 'actions' ? t('Actions') : parsed.mode === 'headings' ? t('Headings') : ''
  modeHint.hidden = parsed.mode === 'search'
  live.textContent = search.status === 'loading' && parsed.mode === 'search' ? t('Searching') : parsed.text.trim() ? (items.length ? tn('{count, plural, one {# result} other {# results}}', items.length, `${items.length} results`) : t('No matches')) : ''
  status.textContent =
    parsed.mode === 'search' && text && search.status === 'loading'
      ? t('Searching…')
      : parsed.mode === 'search' && text && search.status === 'error'
        ? t('Search failed.')
        : !items.length && parsed.text.trim()
          ? t('No matches.')
          : ''
  status.hidden = !status.textContent

  input.setAttribute('aria-expanded', String(items.length > 0))
  if (items.length) input.setAttribute('aria-activedescendant', `bm-palette-option-${safeIndex}`)
  else input.removeAttribute('aria-activedescendant')

  list.replaceChildren(
    ...items.map((item, index) => {
      const active = index === safeIndex
      const row = h(
        'div',
        {
          id: `bm-palette-option-${index}`,
          role: 'option',
          'aria-selected': String(active),
          tabindex: -1,
          class: `w-full cursor-pointer px-3 py-2 text-left transition-colors ${active ? 'bg-wash text-ink' : 'text-ink-2 hover:text-ink'}`,
        },
        h(
          'div',
          { class: 'flex items-baseline gap-3' },
          item.label(),
          item.badge ? h('span', { class: 'shrink-0 small-caps text-sm text-ink-3' }, item.badge) : null,
          item.detail ? h('div', { class: 'min-w-0 flex-1 truncate text-sm text-ink-2' }, item.detail) : null,
          item.bookmarked ? h('div', { class: 'shrink-0 text-xs text-ink-3' }, h('span', { 'aria-hidden': 'true' }, '★'), h('span', { class: 'sr-only' }, t('Bookmarked'))) : null,
        ),
      )
      row.addEventListener('mouseenter', () => {
        if (activeIndex === index) return
        activeIndex = index
        render()
      })
      row.addEventListener('click', () => item.run())
      return row
    }),
  )
  if (items.length) document.getElementById(`bm-palette-option-${safeIndex}`)?.scrollIntoView({ block: 'nearest' })
}

function runSearchFetch() {
  const { parsed, parsedSearch, effectiveDistro } = context()
  controller?.abort()
  controller = null
  if (parsed.mode !== 'search' || !parsedSearch.text) {
    search = { status: 'idle' }
    update()
    return
  }
  const params = new URLSearchParams({ q: parsedSearch.text, limit: '10', offset: '0' })
  if (effectiveDistro !== 'debian') params.set('distro', effectiveDistro)
  const current = new AbortController()
  controller = current
  search = { status: 'loading', data: search.data }
  update()
  fetch(`/api/v1/search?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: current.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as SearchResponse
    })
    .then((data) => {
      if (controller !== current) return
      search = { status: 'success', data }
      update()
    })
    .catch((err: unknown) => {
      if (controller !== current || (err instanceof DOMException && err.name === 'AbortError')) return
      search = { status: 'error' }
      update()
    })
}

function update() {
  items = buildItems()
  render()
}

function build(): Overlay {
  input = h('input', {
    name: 'bm-palette',
    placeholder: t('Search man pages…'),
    class: 'h-10 w-full min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3',
    'aria-label': t('Command palette input'),
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'bm-palette-list',
    autocomplete: 'off',
  })
  modeHint = h('span', { class: 'shrink-0 small-caps text-sm text-ink-3', hidden: true })
  live = h('div', { 'aria-live': 'polite', class: 'sr-only' })
  status = h('div', { class: 'p-3 text-sm text-ink-3', hidden: true })
  list = h('div', { id: 'bm-palette-list', role: 'listbox', class: 'space-y-0.5' })

  const created = createOverlay({
    label: t('Command palette'),
    exitMs: 150,
    hideWhenClosing: true,
    initialFocus: () => input,
    rootClass: (open) => `fixed inset-0 z-50 flex items-end justify-center pb-[env(safe-area-inset-bottom)] sm:items-start sm:pt-[16vh] sm:pb-0 ${open ? '' : 'pointer-events-none'}`,
    scrimClass: (open) => `absolute inset-0 bg-scrim transition-opacity duration-150 motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`,
    panelClass: (open) =>
      `relative flex w-full max-h-[70vh] flex-col overflow-hidden border border-rule-2 bg-raised text-ink shadow-overlay motion-reduce:animate-none sm:max-h-[60vh] sm:w-[min(94vw,40rem)] ${
        open ? 'bm-pop-in' : 'bm-pop-out motion-reduce:invisible'
      }`,
    onOpen: () => {
      trackEvent('palette opened')
      update()
    },
  })
  created.panel.append(
    h('div', { class: 'border-b border-rule px-4 py-2' }, live, h('div', { class: 'flex items-center gap-2' }, input, modeHint)),
    h('div', { class: 'min-h-0 flex-1 overflow-y-auto p-2', role: 'region', 'aria-label': t('Command palette results') }, status, list),
    h(
      'div',
      { class: 'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule px-4 py-2 text-xs text-ink-3' },
      h('span', { class: 'flex items-center gap-1.5' }, kbd('↑↓'), ` ${t('navigate')}`),
      h('span', { class: 'flex items-center gap-1.5' }, kbd('↵'), ` ${t('open')}`),
      h('span', { class: 'flex items-center gap-1.5' }, kbd('esc'), ` ${t('close')}`),
      h('span', { class: 'ml-auto hidden font-mono sm:inline' }, t('> actions · # headings · @distro')),
    ),
  )

  input.addEventListener('input', () => {
    activeIndex = 0
    window.clearTimeout(debounce)
    debounce = window.setTimeout(runSearchFetch, 120)
    update()
  })

  window.addEventListener('keydown', (e) => {
    if (!created.isOpen()) return
    if (isTypingTarget(document.activeElement) && document.activeElement !== input) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) activeIndex = (Math.min(activeIndex, items.length - 1) + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      render()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[Math.min(activeIndex, items.length - 1)]?.run()
    }
  })

  const resync = () => {
    if (created.isOpen()) update()
  }
  window.addEventListener(BOOKMARKS_EVENT, resync)
  window.addEventListener('storage', (e) => {
    if (e.key === BOOKMARKS_STORAGE_KEY) resync()
  })
  return created
}

export function openPalette() {
  overlay ??= build()
  overlay.open()
}
