import { PREFERENCE_AXES, trackEvent } from '../lib/analytics'
import { DISTRO_GROUPS, type Distro } from '../lib/distro'
import { DEFAULT_PREFS, type ReadingPreferences } from '../lib/readingPrefs'
import { BUTTON, h } from './dom'
import { t } from './i18n'
import { createOverlay, drawer, type Overlay } from './overlay'
import { preferredDistro, readingPrefs, resetPrefs, setDefaultDistro, updatePrefs, type PrefAxis } from './state'

/** components/reading/ReadingPrefsDrawer.tsx without React. */
type Option = { id: string; label: string }

function axes(): Array<{ axis: PrefAxis; label: string; options: Option[] }> {
  return [
    { axis: 'fontSize', label: t('Font size'), options: [{ id: 'small', label: 'S' }, { id: 'medium', label: 'M' }, { id: 'large', label: 'L' }, { id: 'xlarge', label: 'XL' }] },
    { axis: 'fontFamily', label: t('Font family'), options: [{ id: 'serif', label: t('Serif') }, { id: 'sans', label: t('Sans') }, { id: 'mono', label: t('Mono') }] },
    { axis: 'lineHeight', label: t('Line height'), options: [{ id: 'compact', label: t('Compact') }, { id: 'normal', label: t('Normal') }, { id: 'relaxed', label: t('Relaxed') }] },
    { axis: 'columnWidth', label: t('Column width'), options: [{ id: 'narrow', label: t('Narrow') }, { id: 'normal', label: t('Normal') }, { id: 'wide', label: t('Wide') }] },
    { axis: 'codeTheme', label: t('Code theme'), options: [{ id: 'auto', label: t('Auto') }, { id: 'light', label: t('Light') }, { id: 'dark', label: t('Dark') }] },
  ]
}

function radioClass(selected: boolean, scroll: boolean) {
  return `-mb-px border-b-2 px-2.5 py-2 text-left text-sm leading-tight transition-colors ${scroll ? 'shrink-0 min-w-[5.75rem]' : 'flex-1'} ${
    selected ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
  }`
}

/** A radiogroup of segment buttons; arrows move the selection with the focus, as before. */
function radioGroup(label: string, options: Option[], value: () => string, onChange: (id: string) => void, scroll = false) {
  const buttons = options.map((option) => h('button', { type: 'button', role: 'radio' }, option.label))
  const group = h('div', { role: 'radiogroup', 'aria-label': label, class: `mt-1.5 flex w-full border-b border-rule ${scroll ? 'overflow-x-auto' : ''}` }, ...buttons)
  const render = () => {
    const current = value()
    options.forEach((option, i) => {
      const selected = option.id === current
      const button = buttons[i]!
      button.setAttribute('aria-checked', String(selected))
      button.tabIndex = selected ? 0 : -1
      button.className = radioClass(selected, scroll)
    })
  }
  options.forEach((option, i) => buttons[i]!.addEventListener('click', () => {
    onChange(option.id)
    render()
  }))
  group.addEventListener('keydown', (e) => {
    const current = Math.max(0, options.findIndex((o) => o.id === value()))
    let next: number | null = null
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + options.length) % options.length
    if (next === null) return
    e.preventDefault()
    onChange(options[next]!.id)
    render()
    const target = next
    requestAnimationFrame(() => buttons[target]?.focus())
  })
  render()
  return { element: h('section', {}, h('div', { class: 'text-sm text-ink-3' }, label), group), render }
}

let overlay: Overlay | null = null
let renders: Array<() => void> = []

function changePref(axis: PrefAxis, value: string) {
  if (readingPrefs()[axis] === value) return
  updatePrefs({ [axis]: value } as Partial<ReadingPreferences>)
  trackEvent('pref changed', axis)
}

function build(): Overlay {
  const created = createOverlay({ label: t('Reading preferences'), ...drawer('sheet-right', 'p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6') })
  const close = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.sm} ${BUTTON.outline}`, 'aria-label': t('Close reading preferences, Esc') }, 'Esc')
  close.addEventListener('click', () => created.close())

  const distroOptions = DISTRO_GROUPS.flatMap((g) => g.items.map((id) => ({ id, label: `@${id}` })))
  const distro = radioGroup(t('Default distro'), distroOptions, preferredDistro, (id) => {
    if (id !== preferredDistro()) setDefaultDistro(id as Distro)
  }, true)
  const groups = axes().map(({ axis, label, options }) => radioGroup(label, options, () => readingPrefs()[axis], (id) => changePref(axis, id)))
  renders = [distro.render, ...groups.map((g) => g.render)]

  const reset = h('button', { type: 'button', class: `${BUTTON.base} ${BUTTON.md} ${BUTTON.outline}` }, t('Reset to defaults'))
  reset.addEventListener('click', () => {
    const prefs = readingPrefs()
    for (const axis of PREFERENCE_AXES) if (prefs[axis] !== DEFAULT_PREFS[axis]) trackEvent('pref changed', axis)
    resetPrefs()
    for (const render of renders) render()
  })

  created.panel.append(
    h(
      'div',
      { class: 'flex items-start justify-between gap-4' },
      h('div', {}, h('h2', { class: 'small-caps text-lg font-semibold text-ink' }, t('Reading preferences')), h('p', { class: 'mt-1 text-sm text-ink-3' }, t('How the manual is set on every page.'))),
      close,
    ),
    h('div', { class: 'mt-6 space-y-6' }, distro.element, ...groups.map((g) => g.element), h('div', { class: 'pt-2' }, reset)),
  )
  return created
}

export function openPrefs() {
  overlay ??= build()
  for (const render of renders) render()
  overlay.open()
}
