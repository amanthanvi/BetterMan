import { parseOptionTerms } from '../components/man/find'
import { trackEvent } from '../lib/analytics'
import { argumentSpec, commandText, composerWarnings, ordered, type ComposePick } from './composeModel'
import { BUTTON, h } from './dom'
import { t } from './i18n'

/**
 * The command composer: pick flags from the index of options while reading and
 * copy the command they make. The add control shows on a row's hover, focus or
 * tap (fix 6); a picked flag is marked on its term and listed in the bar, never
 * by a standing control. Arguments are typed by the reader: the manual's
 * notation is a placeholder, not a value (composeModel.ts).
 */
const picks = new Map<string, ComposePick>()
let bar: HTMLElement | null = null
let commandEl: HTMLElement
let warningEl: HTMLElement
let statusEl: HTMLElement
let liveEl: HTMLElement
let copyButton: HTMLButtonElement

function pageName(): string {
  return document.querySelector<HTMLElement>('[data-bm-manual]')?.dataset.bmPageName ?? ''
}

/** The command line, with an input wherever the reader supplies an argument. */
function renderCommand() {
  const parts: Node[] = [document.createTextNode(pageName())]
  for (const pick of ordered([...picks.values()])) {
    parts.push(document.createTextNode(` ${pick.flag}`))
    const spec = argumentSpec(pick.argument)
    if (!spec) continue
    const input = h('input', {
      type: 'text',
      value: pick.value,
      placeholder: pick.argument.trim(),
      size: Math.max(4, Math.min(24, (pick.value || pick.argument).length + 1)),
      'aria-label': t(spec.optional ? 'Optional value for {flag} ({name})' : 'Value for {flag} ({name})', { flag: pick.flag, name: spec.name }),
      autocomplete: 'off',
      spellcheck: 'false',
      class: 'ml-1 border-0 border-b border-rule-2 bg-transparent px-0.5 font-mono text-sm text-ink placeholder:italic placeholder:text-ink-3 focus:border-accent',
    })
    input.addEventListener('input', () => {
      pick.value = input.value
      input.size = Math.max(4, Math.min(24, (input.value || pick.argument).length + 1))
      renderState()
    })
    parts.push(input)
  }
  commandEl.replaceChildren(...parts)
}

/** Warnings, the missing-value note and Copy, which follow the typed values. */
function renderState() {
  const { missing } = commandText(pageName(), [...picks.values()])
  const warning = composerWarnings([...picks.values()], t)
  warningEl.textContent = warning
  warningEl.hidden = !warning
  statusEl.textContent = missing.length ? t('Fill in {missing} to copy.', { missing: missing.join(', ') }) : ''
  statusEl.hidden = !missing.length
  copyButton.disabled = missing.length > 0
}

function build() {
  commandEl = h('div', { class: 'min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-ink', role: 'group', 'aria-label': t('Command') })
  warningEl = h('p', { class: 'text-xs text-accent' })
  statusEl = h('p', { class: 'text-xs text-ink-3' })
  liveEl = h('div', { class: 'sr-only', 'aria-live': 'polite' })
  copyButton = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}` }, t('Copy'))
  const clear = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.ghost}` }, t('Clear'))
  copyButton.addEventListener('click', async () => {
    const { text, missing } = commandText(pageName(), [...picks.values()])
    if (missing.length) return
    try {
      await navigator.clipboard.writeText(text)
      copyButton.textContent = t('Copied')
      trackEvent('composer copied')
      window.setTimeout(() => {
        copyButton.textContent = t('Copy')
      }, 2000)
    } catch {
      // ignore
    }
  })
  clear.addEventListener('click', () => {
    picks.clear()
    render()
    liveEl.textContent = t('Command cleared.')
  })
  bar = h(
    'section',
    {
      'aria-label': t('Command composer'),
      'data-bm-composer': true,
      class: 'fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 border border-rule-2 bg-raised px-4 py-2 shadow-overlay sm:inset-x-auto sm:left-1/2 sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2',
    },
    h('div', { class: 'flex items-center gap-3' }, commandEl, copyButton, clear),
    statusEl,
    warningEl,
    liveEl,
  )
  document.body.append(bar)
}

function render() {
  if (!bar) build()
  renderCommand()
  renderState()
  bar!.hidden = picks.size === 0
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-bm-action="compose"]')) {
    const flag = button.dataset.bmFlag ?? ''
    const on = picks.has(flag)
    button.setAttribute('aria-pressed', String(on))
    button.setAttribute('aria-label', t(on ? 'Remove {flag} from the command' : 'Add {flag} to the command', { flag }))
    button.textContent = t(on ? 'remove' : 'add')
    // The picked state is a mark on the term (and the bar), not a control left standing.
    const row = button.closest('tr')
    if (on) row?.setAttribute('data-bm-composed', '')
    else row?.removeAttribute('data-bm-composed')
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
    button.setAttribute('aria-label', t('Add {flag} to the command', { flag }))
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
          value: '',
        })
      }
      render()
      liveEl.textContent = removing ? t('Removed {flag}.', { flag }) : t('Added {flag}. {warnings}', { flag, warnings: composerWarnings([...picks.values()], t) }).trim()
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
