import { BUTTON, h, kbd } from './dom'
import { t } from './i18n'
import { createOverlay, DIALOG, type Overlay } from './overlay'

/** components/shell/ShortcutsDialog.tsx without React; the man page group shows only where a manual is rendered. */
function groups(isManPage: boolean) {
  const list: Array<{ title: string; items: Array<{ keys: string[]; desc: string }> }> = [
    { title: t('Navigation'), items: [{ keys: ['H'], desc: t('Jump to recent pages on Home') }, { keys: ['T'], desc: t('Scroll to top') }] },
    { title: t('shortcuts.g.search\u0004Search'), items: [{ keys: ['Ctrl/⌘', 'K'], desc: t('Open command palette') }, { keys: ['/'], desc: t('Focus search (find, on a man page)') }] },
    { title: t('Page'), items: [{ keys: ['B'], desc: t('Toggle sidebar') }] },
    { title: t('Actions'), items: [{ keys: ['D'], desc: t('Cycle theme') }, { keys: ['?'], desc: t('Show keyboard shortcuts') }] },
  ]
  if (isManPage) {
    list.push({
      title: t('Man Page'),
      items: [
        { keys: ['/', 'F'], desc: t('Find in page') },
        { keys: ['n', 'N'], desc: t('Next, previous match') },
        { keys: ['j', 'k'], desc: t('Scroll down, up') },
        { keys: ['g', 'G'], desc: t('Top, bottom') },
        { keys: ['[', ']'], desc: t('Previous, next section') },
        { keys: ['M'], desc: t('Toggle bookmark') },
        { keys: ['P'], desc: t('Open reading preferences') },
        { keys: ['Enter'], desc: t('Next find match (in find)') },
        { keys: ['Shift', 'Enter'], desc: t('Previous find match (in find)') },
      ],
    })
  }
  return list
}

/** "Press Esc to close.": the key cap stands in the catalog's sentence, wherever the language puts it. */
function pressEsc(): Array<string | HTMLElement> {
  const marker = '\uE000'
  return t('Press {key} to close.', { key: marker })
    .split(marker)
    .flatMap((part, index) => (index ? [kbd('Esc'), part] : [part]))
}

let overlay: Overlay | null = null

export function openShortcuts(isManPage: boolean) {
  if (!overlay) {
    const created = createOverlay({ label: t('Keyboard shortcuts'), ...DIALOG })
    const close = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}`, 'aria-label': t('Close keyboard shortcuts, Esc') }, 'Esc')
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
        h('div', {}, h('h2', { class: 'small-caps text-lg font-semibold text-ink' }, t('Keyboard shortcuts')), h('p', { class: 'mt-1 text-sm text-ink-3' }, ...pressEsc())),
        close,
      ),
      h('div', { class: 'mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2' }, ...sections),
    )
    overlay = created
  }
  overlay.open()
}
