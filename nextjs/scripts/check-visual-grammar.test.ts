import { describe, expect, it } from 'vitest'

import { checkCss, checkSource, parseToken } from './check-visual-grammar.mjs'

const DOC = 'components/man/Example.tsx'
const reasons = (text: string, file = DOC) => checkSource(file, text).map((f) => f.reason)
const line = (classes: string) => `<div className="${classes}" />`

describe('parseToken', () => {
  it('keeps arbitrary values whole and separates variants and modifiers', () => {
    expect(parseToken('md:hover:!bg-[color:var(--color-accent)]/50')).toEqual({
      variants: ['md', 'hover'],
      utility: 'bg-[color:var(--color-accent)]',
      modifier: '50',
    })
    expect(parseToken('[&>li]:py-1').variants).toEqual(['[&>li]'])
  })
})

describe('checkSource', () => {
  it('rejects the review escape: border-2 border-rule bg-accent/50 bg-[color:var(--color-accent)]', () => {
    expect(reasons(line('border-2 border-rule bg-accent/50 bg-[color:var(--color-accent)]'))).toEqual(
      expect.arrayContaining([
        'enclosing borders belong to overlays; the document uses hairline rules',
        'the red is for selection, focus and warnings, not fills',
      ]),
    )
  })

  it.each([
    ['border', 'plain border'],
    ['border-2', 'width'],
    ['border-[1.5px]', 'arbitrary width'],
    ['md:border', 'variant'],
    ['border-x border-y', 'paired sides'],
    ['border-t border-r border-b border-l', 'four sides'],
    ['[border:1px_solid_red]', 'arbitrary property'],
  ])('rejects an enclosing border: %s (%s)', (classes) => {
    expect(reasons(line(classes))).toContain('enclosing borders belong to overlays; the document uses hairline rules')
  })

  it.each(['border-b border-rule', 'border-y border-rule', 'border-0', 'border-b-[1.5px] border-ink', 'border-[color:var(--color-rule)]'])(
    'allows hairlines and zero widths: %s',
    (classes) => {
      expect(reasons(line(classes))).toEqual([])
    },
  )

  it.each(['bg-accent', 'bg-accent/50', 'hover:bg-accent', '!bg-accent', 'bg-[var(--color-accent)]', 'bg-[color:var(--color-accent)]'])(
    'rejects a red fill: %s',
    (classes) => {
      expect(reasons(line(classes))).toContain('the red is for selection, focus and warnings, not fills')
    },
  )

  it('allows the red fill only for the contents marker', () => {
    expect(reasons(line('w-0.5 bg-accent'), 'components/toc/Toc.tsx')).toEqual([])
  })

  it.each(['bg-raised', 'bg-raised/80', 'bg-[var(--color-raised)]', 'shadow-overlay', 'shadow-[0_1px_2px_black]', 'drop-shadow-sm'])(
    'keeps overlay chrome out of the document: %s',
    (classes) => {
      expect(reasons(line(classes)).length).toBeGreaterThan(0)
    },
  )

  it('allows overlay chrome in overlay files', () => {
    expect(reasons(line('border border-rule-2 bg-raised shadow-overlay'), 'components/ui/Dialog.tsx')).toEqual([])
  })

  it('keeps the added tint to BetterMan-voice files, unboxed', () => {
    expect(reasons(line('bm-added px-5'))).toContain("the added tint is BetterMan's voice; add the file to ADDED_FILES deliberately")
    expect(reasons(line('bg-added/60'))).toContain("the added tint is BetterMan's voice; add the file to ADDED_FILES deliberately")
    expect(reasons(line('bm-added px-5'), 'components/man/ManPageBrief.tsx')).toEqual([])
    expect(reasons(line('bm-added border border-rule'), 'components/man/ManPageBrief.tsx')).toContain('the added tint is never boxed')
  })

  it.each(['rounded', 'rounded-md', 'sm:rounded-lg', 'rounded-[4px]', '[border-radius:2px]'])('rejects rounded corners: %s', (classes) => {
    expect(reasons(line(classes))).toContain('rounded corners are banned (the grammar is square)')
  })

  it.each(['rounded-none', 'rounded-[0]'])('allows square: %s', (classes) => {
    expect(reasons(line(classes))).toEqual([])
  })

  it.each(['text-[#ff0000]', 'bg-[rgb(0_0_0)]', 'decoration-[oklch(0.5_0.2_30)]', '[color:#333]'])('rejects literal colours: %s', (classes) => {
    expect(reasons(line(classes))).toContain('arbitrary colours bypass the tokens')
  })

  it.each(['text-muted', 'bg-bg', 'border-edge-strong/50', 'hover:text-fg'])('rejects retired tokens: %s', (classes) => {
    expect(reasons(line(classes))).toContain('retired colour token (see DESIGN.md tokens)')
  })

  it.each(['font-[Georgia]', '[font-family:Inter]'])('rejects arbitrary families: %s', (classes) => {
    expect(reasons(line(classes))).toContain('arbitrary font families bypass the three voices')
  })

  it('rejects outline-none on controls but not on a programmatic focus target', () => {
    expect(reasons('<button className="outline-none" />')).toContain('outline-none hides focus; fields use .bm-field')
    expect(reasons('<button className="focus:outline-hidden" />')).toContain('outline-none hides focus; fields use .bm-field')
    expect(reasons('<main tabIndex={-1} className="outline-none" />')).toEqual([])
  })

  it('sets typed values in mono and lets only the placeholder take another voice', () => {
    const voiced = `<input\n  value={q}\n  onChange={(e) => {\n    set(e.target.value)\n  }}\n  className="bm-field font-serif"\n/>`
    expect(reasons(voiced)).toContain('typed input is set in mono; only its placeholder may take another voice')
    expect(reasons('<input className="bm-field md:font-sans" />')).toContain(
      'typed input is set in mono; only its placeholder may take another voice',
    )
    expect(reasons('<input className="bm-field placeholder:font-serif placeholder:italic" />')).toEqual([])
    expect(reasons('<p className="font-serif" />')).toEqual([])
  })

  it('ignores comments', () => {
    expect(reasons('// a border border-rule box, rounded corners and bg-accent are banned')).toEqual([])
  })
})

describe('checkCss', () => {
  it('rejects rounding and web fonts other than BM Text', () => {
    const css = `.x { border-radius: 4px; }\n@font-face { font-family: "Geist Sans"; src: url("/fonts/geist/g.woff2"); }`
    expect(checkCss('app/globals.css', css).map((f) => f.reason)).toEqual([
      'rounded corners are banned (the grammar is square)',
      'BM Text is the only web font; sans and mono are system faces',
    ])
  })

  it('accepts square fields and BM Text', () => {
    const css = `.bm-field { border-radius: 0; }\n@font-face { font-family: "BM Text"; src: url("/fonts/bm-text/a.woff2"); }`
    expect(checkCss('app/globals.css', css)).toEqual([])
  })
})
