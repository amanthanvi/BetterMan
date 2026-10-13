import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManPageDiff } from './ManPageDiff'

const page = { name: 'tar', section: '1', distro: 'debian' }

describe('ManPageDiff', () => {
  it('renders unified additions, removals and changes with explicit comparison direction', () => {
    const html = renderToStaticMarkup(<ManPageDiff page={page} targetDistro="ubuntu" backHref="/man/tar/1?distro=debian" diff={{
      added: [{ area: 'Document', type: 'paragraph', after: 'New.' }],
      removed: [{ area: 'Options', type: '-x', before: '-x\nOld.' }],
      changed: [{ area: 'Document', type: 'paragraph', before: 'Before.', after: 'After.' }],
    }} />)
    expect(html).toContain('Comparing Debian → Ubuntu')
    expect(html).toContain('aria-label="Added"')
    expect(html).toContain('aria-label="Removed"')
    expect(html).toContain('aria-label="Changed"')
    expect(html).toContain('>+</span>')
    expect(html).toContain('>-</span>')
    expect(html).toContain('href="/man/tar/1?distro=debian"')
    expect(html).toContain('Back to man page')
  })

  it('renders one quiet identical line without empty change sections', () => {
    const html = renderToStaticMarkup(<ManPageDiff page={page} targetDistro="fedora" backHref="/man/tar/1" diff={{ added: [], removed: [], changed: [] }} />)
    expect(html).toContain('These distribution variants are identical.')
    expect(html).not.toContain('aria-label="Added"')
    expect(html).not.toContain('aria-label="Removed"')
    expect(html).not.toContain('aria-label="Changed"')
  })
})
