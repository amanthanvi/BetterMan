import { singleKeyShortcutsBlocked } from '../lib/dom'
import { withDistro } from '../lib/distro'
import { restoreReadingPrefs } from '../lib/readingPrefs'
import { cancelScrollPin, getScrollBehavior, scrollElementIntoView } from '../lib/scroll'
import { formatRelativeTime } from '../lib/time'
import { pageLang, t, urlLang } from './i18n'
import { initActions, initBookmark } from './actions'
import { initComposer } from './composer'
import { initFind, openFind } from './find'
import { initOptions } from './options'
import { initPreviews } from './previews'
import { initTables } from './tables'
import { openPalette } from './palette'
import { openPrefs } from './prefs'
import { openShortcuts } from './shortcuts'
import { cycleTheme, initPrefs, initTheme, showNavigating, syncPrefs, urlDistro } from './state'
import { initToc, scrollToSection, toggleContents, tocItems } from './toc'

/**
 * The man page script. The page is complete server HTML (pages/man); this adds
 * what needs JavaScript: the header controls, the keyboard map, find, the
 * contents, option selection, the overlays and the reader's stored state. When
 * every handler is attached it sets `data-bm-hydrated` on <html>, the readiness
 * signal the App Router shell also sets (and the E2E suite waits for).
 */

// j and k scroll about three lines of the manual.
const PAGER_LINE_PX = 90
// Headings settle 8rem under the viewport top (scroll-margin), so a section counts as current from just above that line.
const SECTION_LINE_PX = 136

/** The section heading before or after the reading position, at the shallowest level. */
function adjacentSectionId(direction: 1 | -1): string | null {
  const items = tocItems()
  if (!items.length) return null
  const top = Math.min(...items.map((item) => item.level))
  const headings = items
    .filter((item) => item.level === top)
    .map((item) => document.getElementById(item.id))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
  if (direction === 1) return headings.find((el) => el.getBoundingClientRect().top > SECTION_LINE_PX)?.id ?? null
  return headings.filter((el) => el.getBoundingClientRect().top < SECTION_LINE_PX - 16).at(-1)?.id ?? null
}

function bindKeys(isManPage: boolean, toggleBookmark: (() => void) | null) {
  const hasToc = tocItems().length > 0
  window.addEventListener('keydown', (e) => {
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      openPalette()
      return
    }
    // A focused widget (the contents' j/k) already handled the key.
    if (e.defaultPrevented || singleKeyShortcutsBlocked(document) || !plain) return

    if (e.key === '?') {
      e.preventDefault()
      openShortcuts(isManPage)
      return
    }

    // On a rendered manual the pager keys apply, as in less; n and N live with find.
    if (isManPage) {
      switch (e.key) {
        case '/':
          e.preventDefault()
          openFind()
          return
        case 'j':
        case 'k':
          e.preventDefault()
          // A pin from an earlier jump attaches its stop-on-input listeners a frame late; end it here.
          cancelScrollPin()
          window.scrollBy({ top: e.key === 'j' ? PAGER_LINE_PX : -PAGER_LINE_PX, behavior: 'auto' })
          return
        case 'g':
          // Like less, g and G jump at once: a smooth scroll down tar(1) takes seconds.
          e.preventDefault()
          cancelScrollPin()
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
          return
        case 'G': {
          e.preventDefault()
          // Off-screen blocks take their real height only as they render, so pin the footer
          // to the bottom; the pin re-scrolls as heights settle, until the reader takes over.
          const end = document.querySelector('[data-bm-app-footer]')
          if (end) scrollElementIntoView(end, { behavior: 'auto', block: 'end' })
          return
        }
        case '[':
        case ']': {
          if (!hasToc) break
          e.preventDefault()
          const id = adjacentSectionId(e.key === ']' ? 1 : -1)
          if (!id) return
          scrollToSection(id)
          try {
            window.history.replaceState(null, '', `#${id}`)
          } catch {
            // ignore
          }
          return
        }
      }
    }

    const key = e.key.toLowerCase()
    if (e.key === '/') {
      // No manual to find in (a man-page 404): search instead.
      e.preventDefault()
      openPalette()
    } else if (key === 'd') {
      e.preventDefault()
      cycleTheme()
    } else if (key === 'b' && hasToc) {
      e.preventDefault()
      toggleContents()
    } else if (key === 't') {
      e.preventDefault()
      window.scrollTo({ top: 0, left: 0, behavior: getScrollBehavior() })
    } else if (key === 'h') {
      e.preventDefault()
      showNavigating()
      window.location.assign(`${withDistro('/', urlDistro(), urlLang())}#recent`)
    } else if (isManPage && key === 'p') {
      e.preventDefault()
      openPrefs()
    } else if (isManPage && key === 'f') {
      e.preventDefault()
      openFind()
    } else if (isManPage && key === 'm' && toggleBookmark) {
      e.preventDefault()
      toggleBookmark()
    }
  })
}

function bindHeader() {
  document.querySelector('[data-bm-action="palette"]')?.addEventListener('click', () => openPalette())
  document.querySelector('[data-bm-action="theme"]')?.addEventListener('click', () => cycleTheme())
  document.querySelector('[data-bm-action="find"]')?.addEventListener('click', () => openFind())
  document.querySelector('[data-bm-action="prefs"]')?.addEventListener('click', () => openPrefs())
}

function initOffline() {
  const notice = document.querySelector<HTMLElement>('[data-bm-offline]')
  if (!notice) return
  const update = () => {
    notice.hidden = navigator.onLine
  }
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
}

function initRelativeTimes() {
  for (const time of document.querySelectorAll<HTMLTimeElement>('time[data-bm-relative-time]')) {
    time.textContent = formatRelativeTime(time.dateTime, pageLang(), t('just now'))
  }
}

function init() {
  const isManPage = Boolean(document.querySelector('[data-bm-manual]'))
  initTheme()
  initPrefs()
  // A stored legacy default is dropped, as the App Router provider does; anything else re-syncs its cookie.
  restoreReadingPrefs()
  syncPrefs()
  bindHeader()
  initOffline()
  initRelativeTimes()
  if (isManPage) {
    initActions()
    initToc()
    initFind()
    initOptions()
    initComposer()
    initPreviews()
    initTables()
  }
  bindKeys(isManPage, isManPage ? initBookmark() : null)
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore
    })
  }
  // As the App Router shell does on every route: the page's content takes focus, not the document.
  // A URL fragment makes the browser drop focus to <body> just after load; until
  // the reader acts, take it back when main loses focus to nothing.
  const main = document.getElementById('main-content')
  if (main) {
    main.focus({ preventScroll: true })
    const regain = (e: FocusEvent) => {
      if (e.relatedTarget) return
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) main.focus({ preventScroll: true })
      })
    }
    const stop = () => main.removeEventListener('focusout', regain)
    main.addEventListener('focusout', regain)
    // Until the reader acts, or shortly after load.
    window.addEventListener('pointerdown', stop, { once: true, capture: true })
    window.addEventListener('keydown', stop, { once: true, capture: true })
    if (document.readyState === 'complete') window.setTimeout(stop, 1000)
    else window.addEventListener('load', () => window.setTimeout(stop, 1000), { once: true })
  }
  document.documentElement.setAttribute('data-bm-hydrated', 'true')
}

init()
