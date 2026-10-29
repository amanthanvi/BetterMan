import { parseOptionTerms } from '../components/man/find'
import { trackEvent } from '../lib/analytics'
import { portabilityWords } from '../lib/manBrief'
import { BUTTON, h } from './dom'

/**
 * The command composer: pick flags from the index of options while reading and
 * copy the command they make. Each pick warns, in words, where the flag is not
 * on all three systems, and when two of the page's modes are picked together.
 * The add control shows on hover, focus or a tap on the row (fix 6).
 */
type Pick = { flag: string; argument: string; portability: string | null; mode: boolean }

const picks = new Map<string, Pick>()
let bar: HTMLElement | null = null
let commandEl: HTMLElement
let warningEl: HTMLElement
let liveEl: HTMLElement

function command(): { text: string; node: DocumentFragment } {
  const name = document.querySelector<HTMLElement>('[data-bm-manual]')?.dataset.bmPageName ?? ''
  const ordered = [...picks.values()].sort((a, b) => Number(b.mode) - Number(a.mode))
  const node = document.createDocumentFragment()
  node.append(name)
  let text = name
  for (const pick of ordered) {
    node.append(' ', pick.flag)
    text += ` ${pick.flag}`
    if (pick.argument) {
      const glue = pick.flag.startsWith('--') ? '=' : ' '
      node.append(glue, h('i', {}, pick.argument))
      text += `${glue}${pick.argument}`
    }
  }
  return { text, node }
}

function warnings(): string {
  const out: string[] = []
  for (const pick of picks.values()) if (pick.portability) out.push(`${pick.flag}: ${portabilityWords(pick.portability)}.`)
  const modes = [...picks.values()].filter((pick) => pick.mode).map((pick) => pick.flag)
  if (modes.length > 1) out.push(`Choose one mode: ${modes.join(' and ')} conflict.`)
  return out.join(' ')
}

function build() {
  commandEl = h('code', { class: 'min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-ink', tabindex: 0, role: 'group', 'aria-label': 'Command' })
  warningEl = h('p', { class: 'text-xs text-accent' })
  liveEl = h('div', { class: 'sr-only', 'aria-live': 'polite' })
  const copy = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}` }, 'Copy')
  const clear = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.ghost}` }, 'Clear')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command().text)
      copy.textContent = 'Copied'
      trackEvent('composer copied')
      window.setTimeout(() => {
        copy.textContent = 'Copy'
      }, 2000)
    } catch {
      // ignore
    }
  })
  clear.addEventListener('click', () => {
    picks.clear()
    render()
    liveEl.textContent = 'Command cleared.'
  })
  bar = h(
    'section',
    {
      'aria-label': 'Command composer',
      'data-bm-composer': true,
      class: 'fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 border border-rule-2 bg-raised px-4 py-2 shadow-overlay sm:inset-x-auto sm:left-1/2 sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2',
    },
    h('div', { class: 'flex items-center gap-3' }, commandEl, copy, clear),
    warningEl,
    liveEl,
  )
  document.body.append(bar)
}

function render() {
  if (!bar) build()
  const { node } = command()
  commandEl.replaceChildren(node)
  const warning = warnings()
  warningEl.textContent = warning
  warningEl.hidden = !warning
  bar!.hidden = picks.size === 0
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-bm-action="compose"]')) {
    const flag = button.dataset.bmFlag ?? ''
    const on = picks.has(flag)
    button.setAttribute('aria-pressed', String(on))
    button.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${flag} ${on ? 'from' : 'to'} the command`)
    button.textContent = on ? 'added' : 'add'
  }
}

export function initComposer() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-bm-action="compose"]')]
  if (!buttons.length) return
  for (const button of buttons) {
    const row = button.closest('tr')!
    const link = row.querySelector<HTMLAnchorElement>('a[data-bm-flags]')
    const flags = parseOptionTerms(link?.dataset.bmFlags ?? '')
    // The short spelling where there is one, as people type it.
    const flag = flags.find((f) => !f.startsWith('--')) ?? flags[0] ?? ''
    if (!flag) {
      button.remove()
      continue
    }
    button.dataset.bmFlag = flag
    button.setAttribute('aria-label', `Add ${flag} to the command`)
    button.addEventListener('click', () => {
      const removing = picks.has(flag)
      if (removing) {
        picks.delete(flag)
      } else {
        picks.set(flag, {
          flag,
          argument: link?.querySelector('[data-bm-option-argument]')?.textContent?.trim() ?? '',
          portability: row.dataset.bmPortability ?? null,
          mode: row.hasAttribute('data-bm-mode'),
        })
      }
      render()
      liveEl.textContent = removing ? `Removed ${flag}.` : `Added ${flag}. ${warnings()}`.trim()
    })
  }
  // On touch there is no hover: a tap on the row (not on its links) reveals its add control.
  document.querySelector('[data-bm-options]')?.addEventListener('click', (e) => {
    if (window.matchMedia('(hover: hover)').matches) return
    const target = e.target as Element
    if (target.closest('a, button, input, summary')) return
    const row = target.closest('tr[data-bm-option-row]')
    if (row) row.setAttribute('data-bm-revealed', '')
  })
}
