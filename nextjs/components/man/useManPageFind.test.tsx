// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useManPageFind } from './useManPageFind'

let reactRoot: Root
let article: HTMLElement
let controls: ReturnType<typeof useManPageFind>
const optionTerms = ['--create']
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  article = document.createElement('article')
  article.innerHTML = '<p>t<strong>ar</strong> --create tar</p><pre><code>tar</code></pre>'
  document.body.append(article)
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  const articleRef = { current: article }
  function Harness() {
    controls = useManPageFind({ articleRef, optionTerms, documentKey: 'tar:1' })
    return <input ref={controls.findInputRef} />
  }
  act(() => reactRoot.render(<Harness />))
})

afterEach(() => {
  act(() => reactRoot?.unmount())
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function find(query: string) {
  act(() => {
    controls.openFind()
    controls.onFindChange(query)
  })
  await act(async () => { vi.advanceTimersByTime(150) })
}

describe('DOM find controller', () => {
  it('debounces counts and navigates logical split matches with wrapping', async () => {
    await find('tar')
    expect(controls.findCountLabel).toBe('1/3')
    expect(article.querySelectorAll('.bm-find-active')).toHaveLength(2)
    act(() => controls.goNext())
    expect(controls.findCountLabel).toBe('2/3')
    expect(article.querySelectorAll('.bm-find-active')).toHaveLength(1)
    act(() => controls.goPrev())
    expect(controls.findCountLabel).toBe('1/3')
    act(() => controls.goPrev())
    expect(controls.findCountLabel).toBe('3/3')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('reapplies after code HTML replacement and clamps a removed active match', async () => {
    await find('tar')
    act(() => controls.goPrev())
    await act(async () => {
      article.querySelector('code')!.innerHTML = '<span class="hljs-built_in">tar</span> tar'
      await Promise.resolve()
      vi.advanceTimersByTime(20)
    })
    expect(controls.findCountLabel).toBe('3/4')
    expect(article.querySelector('.hljs-built_in .bm-find-active')?.textContent).toBe('tar')
    await act(async () => {
      article.querySelector('pre')!.remove()
      await Promise.resolve()
      vi.advanceTimersByTime(20)
    })
    expect(controls.findCountLabel).toBe('2/2')
    expect(article.querySelector('.bm-find-active')?.textContent).toBe('tar')
  })

  it('clears stale marks while typing and on close, preserving option highlights', async () => {
    await find('create')
    expect(article.querySelectorAll('mark[data-bm-opt]')).toHaveLength(0)
    act(() => controls.onFindChange('tar'))
    expect(controls.findCountLabel).toBe('…')
    expect(article.querySelectorAll('mark[data-bm-find]')).toHaveLength(0)
    expect(article.querySelectorAll('mark[data-bm-opt]')).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(controls.findCountLabel).toBe('1/3')
    act(() => controls.closeFind())
    expect(article.querySelectorAll('mark[data-bm-find]')).toHaveLength(0)
    expect(article.querySelectorAll('mark[data-bm-opt]')).toHaveLength(1)
    act(() => controls.onClearFind())
    expect(controls.findCountLabel).toBe('—')
  })

  it('cancels pending focus restoration on reopen and restores the original trigger on close', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    act(() => controls.openFind())
    const input = controls.findInputRef.current!
    expect(document.activeElement).toBe(input)
    act(() => controls.closeFind())
    act(() => controls.openFind())
    await act(async () => { vi.advanceTimersByTime(20) })
    expect(document.activeElement).toBe(input)
    act(() => controls.closeFind())
    await act(async () => { vi.advanceTimersByTime(20) })
    expect(document.activeElement).toBe(trigger)
  })
})
