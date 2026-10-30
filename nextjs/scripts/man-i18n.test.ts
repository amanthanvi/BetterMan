import { describe, expect, it } from 'vitest'

import { eraseMessages } from './man-i18n.mjs'

describe('the English man script', () => {
  it('erases a message wrapper to the English text, without its context', () => {
    expect(eraseMessages("button.title = t('Link copied')")).toBe('button.title = "Link copied"')
    expect(eraseMessages("x(t('man.bookmarkRemoveLabel\\u0004Remove bookmark for {citation}'))")).toBe('x("Remove bookmark for {citation}")')
    expect(eraseMessages("label: t('It\\'s “quoted”'), b: t(\n  'Next match'\n)")).toBe('label: "It\'s “quoted”", b: "Next match"')
  })

  it('writes a call that fills values as the template it replaced', () => {
    expect(eraseMessages("x = t('Added {flag}. {warnings}', { flag, warnings: composerWarnings(picks, t) })")).toBe(
      'x = `Added ${flag}. ${composerWarnings(picks, t)}`',
    )
    expect(eraseMessages("t('{shown} of {total}', { shown, total })")).toBe('`${shown} of ${total}`')
    expect(eraseMessages("y(t('Value for {flag} ({name})', { flag: pick.flag, name: spec.name }), 1)")).toBe('y(`Value for ${pick.flag} (${spec.name})`, 1)')
    expect(eraseMessages("t('Cost `{n}` $ {x}', { n: a.map((v) => ({ v })).length, x: '}' })")).toBe('`Cost \\`${a.map((v) => ({ v })).length}\\` $ ${\'}\'}`')
  })

  it('keeps a call it cannot rewrite safely, a dynamic key and anything that is not the translator', () => {
    const kept = [
      "t('Added {flag} and {more}.', { flag })",
      "t('Added {flag}.', { ...rest })",
      "t('{count, plural, one {#} other {#s}}', { count })",
      't(group.title)',
      "state.t('x')",
      "split('a')",
      "const hot = (t) => t('x', 1)",
    ]
    for (const source of kept) expect(eraseMessages(source)).toBe(source)
  })

  it('drops the message of a plural, whose English the caller writes', () => {
    expect(eraseMessages("tn('{count, plural, one {# row} other {# rows}}', n, `${n} rows`)")).toBe('tn(0, n, `${n} rows`)')
  })
})
