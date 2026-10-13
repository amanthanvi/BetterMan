// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { applyDocHighlights, clearDocHighlights } from './docHighlights'

function article(html: string): HTMLElement {
  const root = document.createElement('article')
  root.innerHTML = html
  return root
}

describe('rendered document highlights', () => {
  it('counts split inline and syntax spans once without losing markup', () => {
    const root = article('<p>Use <strong>t</strong><em>ar</em> here.</p><pre><code><span>ta</span>r</code></pre>')
    const original = root.innerHTML
    const matches = applyDocHighlights(root, { findQuery: 'TAR' })

    expect(matches).toHaveLength(2)
    expect(matches.map((parts) => parts.map((part) => part.textContent).join(''))).toEqual(['tar', 'tar'])
    expect(root.querySelectorAll('mark[data-bm-find]')).toHaveLength(4)
    expect(root.querySelector('strong mark')?.textContent).toBe('t')
    clearDocHighlights(root)
    expect(root.innerHTML).toBe(original)
  })

  it('find takes priority over overlapping option matches and cleanup restores original text nodes', () => {
    const root = article('<p>--create and --create, then -c.</p>')
    const originalNode = root.querySelector('p')!.firstChild
    const original = root.innerHTML
    applyDocHighlights(root, { findQuery: 'create', optionTerms: ['-c', '--create'] })
    expect(root.querySelectorAll('mark[data-bm-find]')).toHaveLength(2)
    expect([...root.querySelectorAll('mark[data-bm-opt]')].map((mark) => mark.textContent)).toEqual(['-c'])
    expect(root.querySelector('mark mark')).toBeNull()

    applyDocHighlights(root, { optionTerms: ['--create', '-c'] })
    expect(root.querySelectorAll('mark[data-bm-find]')).toHaveLength(0)
    expect(root.querySelectorAll('mark[data-bm-opt]')).toHaveLength(3)
    clearDocHighlights(root)
    expect(root.innerHTML).toBe(original)
    expect(root.querySelector('p')!.firstChild).toBe(originalNode)
  })

  it('excludes controls, hidden text, and screen-reader-only annotations', () => {
    const root = article('<p>tar <button>tar</button><span aria-hidden="true">tar</span><span class="sr-only">tar</span><span hidden>tar</span><span inert>tar</span></p>')
    expect(applyDocHighlights(root, { findQuery: 'tar' })).toHaveLength(1)
    expect(root.querySelectorAll('mark[data-bm-find]')).toHaveLength(1)
  })

  it('does not join across blocks, table cells, breaks, or skipped content', () => {
    const root = article('<p>ta</p><p>r</p><p>ta<br>r</p><p>ta<button>x</button>r</p><table><tr><td>ta</td><td>r</td></tr></table>')
    expect(applyDocHighlights(root, { findQuery: 'tar' })).toHaveLength(0)
  })

  it('reindexes replaced code HTML and removes stale option highlights', () => {
    const root = article('<pre><code>tar --create</code></pre>')
    applyDocHighlights(root, { findQuery: 'tar', optionTerms: ['--create'] })
    root.querySelector('code')!.innerHTML = '<span class="hljs-built_in">tar</span> --create tar'
    const matches = applyDocHighlights(root, { findQuery: 'tar' })
    expect(matches).toHaveLength(2)
    expect(root.querySelector('.hljs-built_in mark')?.textContent).toBe('tar')
    expect(root.querySelectorAll('mark[data-bm-opt]')).toHaveLength(0)
    clearDocHighlights(root)
    expect(root.querySelector('code')!.innerHTML).toBe('<span class="hljs-built_in">tar</span> --create tar')
  })

  it('matches literal punctuation and leaves a renderer text update intact', () => {
    const root = article('<p>[a] [a]</p>')
    const text = root.querySelector('p')!.firstChild as Text
    expect(applyDocHighlights(root, { findQuery: '[a]' })).toHaveLength(2)
    text.data = 'updated by renderer'
    clearDocHighlights(root)
    expect(root.textContent).toBe('updated by renderer')
  })
})
