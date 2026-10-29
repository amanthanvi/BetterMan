import { BUTTON, h, kbd } from './dom'
import { createOverlay, DIALOG, type Overlay } from './overlay'

/** components/shell/ShortcutsDialog.tsx without React; the man page group shows only where a manual is rendered. */
function groups(isManPage: boolean) {
  const list: Array<{ title: string; items: Array<{ keys: string[]; desc: string }> }> = [
    { title: 'Navigation', items: [{ keys: ['H'], desc: 'Jump to recent pages on Home' }, { keys: ['T'], desc: 'Scroll to top' }] },
    { title: 'Search', items: [{ keys: ['Ctrl/⌘', 'K'], desc: 'Open command palette' }, { keys: ['/'], desc: 'Focus search (find, on a man page)' }] },
    { title: 'Page', items: [{ keys: ['B'], desc: 'Toggle sidebar' }] },
    { title: 'Actions', items: [{ keys: ['D'], desc: 'Cycle theme' }, { keys: ['?'], desc: 'Show keyboard shortcuts' }] },
  ]
  if (isManPage) {
    list.push({
      title: 'Man Page',
      items: [
        { keys: ['/', 'F'], desc: 'Find in page' },
        { keys: ['n', 'N'], desc: 'Next, previous match' },
        { keys: ['j', 'k'], desc: 'Scroll down, up' },
        { keys: ['g', 'G'], desc: 'Top, bottom' },
        { keys: ['[', ']'], desc: 'Previous, next section' },
        { keys: ['M'], desc: 'Toggle bookmark' },
        { keys: ['P'], desc: 'Open reading preferences' },
        { keys: ['Enter'], desc: 'Next find match (in find)' },
        { keys: ['Shift', 'Enter'], desc: 'Previous find match (in find)' },
      ],
    })
  }
  return list
}

let overlay: Overlay | null = null

export function openShortcuts(isManPage: boolean) {
  if (!overlay) {
    const created = createOverlay({ label: 'Keyboard shortcuts', ...DIALOG })
    const close = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}`, 'aria-label': 'Close keyboard shortcuts, Esc' }, 'Esc')
    close.addEventListener('click', () => created.close())
    const sections = groups(isManPage).map((group) => {
      const id = `bm-shortcuts-${group.title.toLowerCase().replaceAll(' ', '-')}`
      return h(
        'section',
        { 'aria-labelledby': id, class: 'space-y-3' },
        h('h3', { id, class: 'text-sm font-semibold text-ink-2' }, group.title),
        h(
          'ul',
          { class: 'space-y-1.5' },
          ...group.items.map((item) =>
            h(
              'li',
              { class: 'flex items-start justify-between gap-4' },
              h('div', { class: 'min-w-0 text-sm text-ink-2' }, item.desc),
              h('div', { class: 'flex flex-wrap items-center justify-end gap-1' }, ...item.keys.map((key) => kbd(key))),
            ),
          ),
        ),
      )
    })
    created.panel.append(
      h(
        'div',
        { class: 'flex items-start justify-between gap-4' },
        h('div', {}, h('h2', { class: 'small-caps text-lg font-semibold text-ink' }, 'Keyboard shortcuts'), h('p', { class: 'mt-1 text-sm text-ink-3' }, 'Press ', kbd('Esc'), ' to close.')),
        close,
      ),
      h('div', { class: 'mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2' }, ...sections),
    )
    overlay = created
  }
  overlay.open()
}
