import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CodeBlock, defaultCodeLanguage } from './CodeBlock'
import { tServer } from '../../lib/i18n/testing'

describe('defaultCodeLanguage', () => {
  it('uses C for system calls, library functions and kernel interfaces', () => {
    for (const section of ['2', '3', '3p', '3ssl', '3posix', '9']) expect(defaultCodeLanguage(section)).toBe('c')
  })

  it('uses shell elsewhere, including Perl module pages', () => {
    for (const section of ['1', '1ssl', '5', '7', '8', '3pm', '3perl']) expect(defaultCodeLanguage(section)).toBe('bash')
  })
})

describe('CodeBlock language', () => {
  it('falls back to the default language when the hint is missing or unknown', () => {
    expect(renderToStaticMarkup(<CodeBlock text="int x;" defaultLanguage="c" t={tServer} />)).toContain('language-c')
    expect(renderToStaticMarkup(<CodeBlock text="int x;" languageHint="cobol" defaultLanguage="c" t={tServer} />)).toContain('language-c')
  })

  it('prefers an explicit hint', () => {
    expect(renderToStaticMarkup(<CodeBlock text="make all" languageHint="makefile" defaultLanguage="c" t={tServer} />)).toContain(
      'language-makefile',
    )
  })
})
