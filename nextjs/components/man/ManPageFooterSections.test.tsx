import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ManPageFooterSections } from './ManPageFooterSections'
import { tServer } from '../../lib/i18n/testing'
it('omits unavailable derived headings and renders capped backlinks, family and package links', () => {
  const props = { reportHref: 'https://github.com/example/issues/new', urlDistro: 'freebsd' as const, relatedItems: [] }
  expect(renderToStaticMarkup(<ManPageFooterSections urlLang={null} t={tServer} {...props} />)).not.toContain('Referenced by')
  const html = renderToStaticMarkup(<ManPageFooterSections urlLang={null} t={tServer} {...props} derived={{
    referencedBy: { items: [{ name: 'bsdtar', section: '1' }], hasMore: true },
    family: { name: 'git', items: [{ name: 'git-add', section: '1' }], hasMore: true },
    package: { name: 'libX11', version: '1.8' },
  }} />)
  expect(html).toContain('aria-label="Referenced by"')
  expect(html).toContain('/man/bsdtar/1?distro=freebsd')
  expect(html).toContain('additional pages are omitted')
  expect(html).toContain('aria-label="Command family"')
  expect(html).toContain('/man/git-add/1?distro=freebsd')
  expect(html).toContain('/pkg/libX11?distro=freebsd')
  expect(html).toContain('/search?q=git-&amp;distro=freebsd')
  expect(html).toContain('bm-added')
})
