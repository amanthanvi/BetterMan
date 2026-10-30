import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { cssString, ManHeadTags, printPageCss, type ManHeadData } from './ManHead'

const head: ManHeadData = {
  title: 'tar(1) — BetterMan',
  description: 'an archiving utility',
  canonical: 'https://betterman.sh/man/tar/1',
  ogImage: { url: 'https://betterman.sh/man/tar/1/og', width: 1200, height: 630, alt: 'tar(1): an archiving utility' },
  jsonLd: null,
  noindex: false,
}

describe('ManHeadTags', () => {
  it('shares the page under its own title by default', () => {
    const html = renderToStaticMarkup(<ManHeadTags {...head} />)
    expect(html).toContain('<meta property="og:title" content="tar(1) — BetterMan"/>')
    expect(html).toContain('<meta name="twitter:description" content="an archiving utility"/>')
    expect(html).not.toContain('<style')
  })

  it('shares a flag under its own title and definition, keeping the document title', () => {
    const html = renderToStaticMarkup(<ManHeadTags {...head} share={{ title: 'tar -x · tar(1) — BetterMan', description: 'Extract files.' }} />)
    expect(html).toContain('<title>tar(1) — BetterMan</title>')
    expect(html).toContain('<meta property="og:title" content="tar -x · tar(1) — BetterMan"/>')
    expect(html).toContain('<meta name="twitter:title" content="tar -x · tar(1) — BetterMan"/>')
    expect(html).toContain('<meta property="og:description" content="Extract files."/>')
    expect(html).toContain('<meta name="description" content="an archiving utility"/>')
  })

  it('writes the printed running head and foot as page-margin content', () => {
    const html = renderToStaticMarkup(<ManHeadTags {...head} print={{ head: ['TAR(1)', 'User Commands', 'TAR(1)'], foot: ['tar 1.35', 'Debian · Oct 28, 2026'] }} />)
    expect(html).toContain(
      '<style>@page{@top-left{content:"TAR(1)"}@top-center{content:"User Commands"}@top-right{content:"TAR(1)"}@bottom-left{content:"tar 1.35"}@bottom-center{content:"Debian · Oct 28, 2026"}}</style>',
    )
  })
})

describe('print page CSS', () => {
  it('cannot end the string, the rule or the style element', () => {
    expect(cssString('a"b\\c</style>{}\n')).toBe('"a\\22 b\\5c c\\3c /style>{} "')
    const css = printPageCss({ head: ['X"}</style><script>', '', ''], foot: ['', ''] })
    expect(css).not.toContain('</style')
    expect(css).not.toMatch(/content:"X"/)
  })
})
