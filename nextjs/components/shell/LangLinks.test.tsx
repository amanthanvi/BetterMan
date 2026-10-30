import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { LangLinks } from './LangLinks'

const hrefs = { en: '/-/lang/en', de: '/-/lang/de', ja: '/-/lang/ja' }

it('renders nothing until a language beyond English is public', () => {
  expect(renderToStaticMarkup(<LangLinks label="Language" langs={['en']} current="en" hrefs={hrefs} />)).toBe('')
})

it('links every other public language in its own name through the remembering link, and marks the current one', () => {
  const html = renderToStaticMarkup(<LangLinks label="Sprache" langs={['en', 'de', 'ja']} current="de" hrefs={hrefs} />)
  expect(html).toContain('aria-label="Sprache"')
  expect(html).toContain('<a href="/-/lang/en" lang="en" hrefLang="en" class="underline" rel="nofollow">English</a>')
  expect(html).toContain('>日本語</a>')
  expect(html).toContain('<span lang="de" aria-current="true" class="text-ink">Deutsch</span>')
  expect(html).not.toContain('href="/-/lang/de"')
})
