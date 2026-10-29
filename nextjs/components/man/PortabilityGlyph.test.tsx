import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { OptionsTable } from './OptionsTable'
import { PortabilityGlyph } from './PortabilityGlyph'
const systems = [{ system: 'gnu-linux', distro: 'fedora' }, { system: 'freebsd', distro: 'freebsd' }, { system: 'macos', distro: 'macos' }] as const
it('distinguishes a manual omitted from a dataset from an absent flag and different behavior', () => {
  const html = renderToStaticMarkup(<PortabilityGlyph codes="xpd" systems={[...systems]} />)
  expect(html).toContain('data-v="no"')
  expect(html).toContain('data-v="page-unavailable"')
  expect(html).toContain('>—</span>')
  expect(html).toContain('data-v="differs"')
  expect(html).toContain('GNU/Linux (fedora): flag absent from this manual')
  expect(html).toContain('FreeBSD (freebsd): manual page not included on this system')
  expect(html).toContain('macOS (macos): different argument shape')
})
it('omits the glyph when all three systems have the option', () => {
  expect(renderToStaticMarkup(<PortabilityGlyph codes="aaa" systems={[...systems]} />)).toBe('')
})

it('shows an unknown glyph for options outside the loaded response page', () => {
  const html = renderToStaticMarkup(<PortabilityGlyph codes="lll" systems={[...systems]} />)
  expect(html.match(/data-v="unknown"/g)).toHaveLength(3)
  expect(html).toContain('portability not loaded')
})

it('the options table marks an unloaded option unknown rather than visually portable', () => {
  const html = renderToStaticMarkup(<OptionsTable options={[{ flags: '--later', anchorId: 'later', description: 'Later option.' }]} rowIds={new Map()} portability={{ systems: [...systems], rows: [['first', 'aaa']], total: 3009, available: 3009, nextOffset: 256 }} />)
  expect(html.match(/data-v="unknown"/g)).toHaveLength(3)
  expect(html).toContain('portability not loaded')
})
