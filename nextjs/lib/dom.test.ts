// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { isTypingTarget, singleKeyShortcutsBlocked } from './dom'

function mount(html: string) {
  document.body.innerHTML = html
}

function focus(selector: string) {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`missing ${selector}`)
  el.focus()
  expect(document.activeElement).toBe(el)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isTypingTarget', () => {
  it('treats text-like fields and contenteditable as typing targets', () => {
    mount(`
      <input id="text" />
      <input id="search" type="search" />
      <textarea id="area"></textarea>
      <select id="select"><option>a</option></select>
    `)
    for (const id of ['text', 'search', 'area', 'select']) {
      expect(isTypingTarget(document.getElementById(id))).toBe(true)
    }

    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('ignores buttons, toggles, and missing elements', () => {
    mount(`
      <button id="button">b</button>
      <input id="checkbox" type="checkbox" />
      <input id="radio" type="radio" />
      <input id="range" type="range" />
      <input id="input-button" type="button" />
    `)
    // jsdom leaves `isContentEditable` undefined where browsers report false.
    for (const id of ['button', 'checkbox', 'radio', 'range', 'input-button']) {
      expect(isTypingTarget(document.getElementById(id))).toBeFalsy()
    }
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('singleKeyShortcutsBlocked', () => {
  it('allows shortcuts on the page when nothing is focused and no dialog is open', () => {
    mount('<main><button id="page">page</button></main>')
    expect(singleKeyShortcutsBlocked(document)).toBe(false)
    focus('#page')
    expect(singleKeyShortcutsBlocked(document)).toBe(false)
  })

  it('blocks shortcuts while typing in a field on the page', () => {
    mount('<input id="search" type="search" /><textarea id="area"></textarea>')
    focus('#search')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
    focus('#area')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
  })

  it('blocks shortcuts while a modal is open even if focus is outside it', () => {
    mount(`
      <main><button id="page">page</button></main>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><button>Esc</button></div>
    `)
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
    focus('#page')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
  })

  it('blocks shortcuts while focus is on a non-typing control inside a dialog', () => {
    mount(`
      <div role="dialog" aria-label="Reading preferences">
        <div role="radiogroup"><button id="radio" role="radio">L</button></div>
      </div>
    `)
    focus('#radio')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
  })

  it('blocks shortcuts while focus is inside an alertdialog or an open native dialog', () => {
    mount('<div role="alertdialog"><button id="confirm">OK</button></div>')
    focus('#confirm')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)

    mount('<dialog open><button id="native">OK</button></dialog>')
    expect(singleKeyShortcutsBlocked(document)).toBe(true)
  })

  it('allows shortcuts again once an overlay drops its dialog semantics while exiting', () => {
    mount(`
      <main><button id="page">page</button></main>
      <div aria-hidden="true" data-state="closed"><button>Esc</button></div>
      <dialog><button>closed</button></dialog>
    `)
    focus('#page')
    expect(singleKeyShortcutsBlocked(document)).toBe(false)
  })
})
