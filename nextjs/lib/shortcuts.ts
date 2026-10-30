import type { PlainKey } from './i18n/lite'
import type { CommonKey } from './i18n/catalog/en/common'

export type ShortcutGroup = { id: string; title: PlainKey<CommonKey>; items: Array<{ keys: string[]; desc: PlainKey<CommonKey> }> }

/**
 * The keyboard map the shortcuts dialog lists (DESIGN.md). Shared by the App
 * Router dialog and the man page script's; the man page group shows only where
 * a manual is rendered. Keys are not translated, descriptions are.
 */
export function shortcutGroups(isManPage: boolean): ShortcutGroup[] {
  const groups: ShortcutGroup[] = [
    {
      id: 'navigation',
      title: 'Navigation',
      items: [
        { keys: ['H'], desc: 'Jump to recent pages on Home' },
        { keys: ['T'], desc: 'Scroll to top' },
      ],
    },
    {
      id: 'search',
      title: 'shortcuts.g.search\u0004Search',
      items: [
        { keys: ['Ctrl/⌘', 'K'], desc: 'Open command palette' },
        { keys: ['/'], desc: 'Focus search (find, on a man page)' },
      ],
    },
    { id: 'page', title: 'Page', items: [{ keys: ['B'], desc: 'Toggle sidebar' }] },
    {
      id: 'actions',
      title: 'Actions',
      items: [
        { keys: ['D'], desc: 'Cycle theme' },
        { keys: ['?'], desc: 'Show keyboard shortcuts' },
      ],
    },
  ]
  if (isManPage) {
    groups.push({
      id: 'man-page',
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
  return groups
}
