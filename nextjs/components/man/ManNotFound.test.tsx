import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ManMiss } from '../../lib/manLookup'
import { ManNotFound, manMiss } from './ManNotFound'

const miss: ManMiss = { name: 'ta', section: null, distro: 'debian', urlDistro: null, suggestions: [], distros: [], limited: false }

describe('manMiss', () => {
  it('says what man-db says', () => {
    expect(manMiss('foo', null)).toEqual({ command: 'man foo', message: 'No manual entry for foo' })
    expect(manMiss('tar', '9')).toEqual({ command: 'man 9 tar', message: 'No manual entry for tar in section 9' })
  })
})

describe('ManNotFound', () => {
  it('answers in man’s voice and links to search', () => {
    const html = renderToStaticMarkup(<ManNotFound miss={{ ...miss, section: '9' }} />)
    expect(html).toContain('$ man 9 ta')
    expect(html).toMatch(/<h1[^>]*>No manual entry for ta in section 9<\/h1>/)
    expect(html).toContain('href="/search?q=ta"')
    expect(html).not.toContain('BSD-licensed subset')
    expect(html).not.toContain('Did you mean')
    expect(html).not.toContain('Other distributions')
  })

  it('lists suggestions and the other distros that have the page', () => {
    const html = renderToStaticMarkup(
      <ManNotFound
        miss={{
          ...miss,
          section: '1',
          urlDistro: 'debian',
          suggestions: [{ name: 'tar', section: '1', description: 'an archiving utility' }],
          distros: ['debian', 'fedora'],
        }}
      />,
    )
    expect(html).toContain('aria-label="Did you mean"')
    expect(html).toContain('href="/man/tar/1?distro=debian"')
    expect(html).toContain('an archiving utility')
    expect(html).toContain('Not in Debian.')
    expect(html).toContain('href="/man/ta/1?distro=fedora"')
    expect(html).not.toContain('href="/man/ta/1?distro=debian"')
  })

  it('keeps the URL distro on the search link and explains the macOS subset', () => {
    const html = renderToStaticMarkup(<ManNotFound miss={{ ...miss, distro: 'macos', urlDistro: 'macos' }} />)
    expect(html).toMatch(/<h1[^>]*>No manual entry for ta<\/h1>/)
    expect(html).toContain('href="/search?q=ta&amp;distro=macos"')
    expect(html).toContain('BetterMan carries only the BSD-licensed subset of the manual pages macOS ships')
  })
})
