import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Distro } from '../../lib/distro'
import { ManNotFound, manMiss } from './ManNotFound'

const state = vi.hoisted(() => ({
  params: { name: 'ta' } as { name: string; section?: string },
  distro: 'debian' as Distro,
  urlDistro: null as Distro | null,
}))

vi.mock('next/navigation', () => ({ useParams: () => state.params }))
vi.mock('../state/distro', () => ({ useDistro: () => ({ distro: state.distro, urlDistro: state.urlDistro }) }))
vi.mock('../ui/LinkPendingHint', () => ({ LinkPendingHint: () => null }))

afterEach(() => {
  state.params = { name: 'ta' }
  state.distro = 'debian'
  state.urlDistro = null
})

describe('manMiss', () => {
  it('says what man-db says', () => {
    expect(manMiss('foo', null)).toEqual({ command: 'man foo', message: 'No manual entry for foo' })
    expect(manMiss('tar', '9')).toEqual({ command: 'man 9 tar', message: 'No manual entry for tar in section 9' })
  })
})

describe('ManNotFound', () => {
  it('answers in man’s voice and links to search', () => {
    state.params = { name: 'ta', section: '9' }
    const html = renderToStaticMarkup(<ManNotFound />)
    expect(html).toContain('$ man 9 ta')
    expect(html).toMatch(/<h1[^>]*>No manual entry for ta in section 9<\/h1>/)
    expect(html).toContain('href="/search?q=ta"')
    expect(html).not.toContain('BSD-licensed subset')
  })

  it('keeps the URL distro on the search link and explains the macOS subset', () => {
    state.distro = 'macos'
    state.urlDistro = 'macos'
    const html = renderToStaticMarkup(<ManNotFound />)
    expect(html).toMatch(/<h1[^>]*>No manual entry for ta<\/h1>/)
    expect(html).toContain('href="/search?q=ta&amp;distro=macos"')
    expect(html).toContain('BetterMan carries only the BSD-licensed subset of the manual pages macOS ships')
  })
})
