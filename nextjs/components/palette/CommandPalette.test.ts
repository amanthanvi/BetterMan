import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildPaletteManHref, navigatePaletteMan, parsePaletteInput, parseSearchText, resultToItem } from './CommandPalette'

afterEach(() => vi.unstubAllGlobals())

describe('CommandPalette helpers', () => {
  it('parses action and heading prefixes while preserving escaped literals', () => {
    expect(parsePaletteInput('>theme')).toEqual({ mode: 'actions', text: 'theme' })
    expect(parsePaletteInput('#options')).toEqual({ mode: 'headings', text: 'options' })
    expect(parsePaletteInput('\\>literal')).toEqual({ mode: 'search', text: 'literal' })
    expect(parsePaletteInput('\\#literal')).toEqual({ mode: 'search', text: 'literal' })
    expect(parsePaletteInput('tar')).toEqual({ mode: 'search', text: 'tar' })
  })

  it('extracts optional distro prefixes for palette search', () => {
    expect(parseSearchText('@arch tar')).toEqual({ distro: 'arch', text: 'tar' })
    expect(parseSearchText('@fedora printf')).toEqual({ distro: 'fedora', text: 'printf' })
    expect(parseSearchText('@macos printf')).toEqual({ text: '@macos printf' })
    expect(parseSearchText('@unknown tar')).toEqual({ text: '@unknown tar' })
    expect(parseSearchText('grep')).toEqual({ text: 'grep' })
  })

  it('carries option anchors from search results through palette activation', () => {
    const runMan = vi.fn()
    const item = resultToItem({ name: 'tar', section: '1', title: 'tar', description: 'Archive tool', highlights: [], match: 'option', anchorId: 'sort=' }, {
      query: '--sort', distro: 'ubuntu', runMan,
    })
    expect(item.anchorId).toBe('sort=')
    item.run()
    expect(runMan).toHaveBeenCalledWith('tar', '1', 'ubuntu', 'sort=')
    expect(buildPaletteManHref(...runMan.mock.calls[0] as [string, string, 'ubuntu', string])).toBe('/man/tar/1?distro=ubuntu#sort%3D')
  })

  it('keeps normal results and option results without anchors on the plain man route', () => {
    for (const match of [undefined, 'option'] as const) {
      const runMan = vi.fn()
      const result = { name: 'tar', section: '1', title: 'tar', description: 'Archive tool', highlights: [], match }
      const item = resultToItem(result, { query: 'tar', distro: 'debian', runMan })
      expect(item.anchorId).toBeUndefined()
      item.run()
      expect(runMan).toHaveBeenCalledWith('tar', '1', 'debian', undefined)
    }
    const item = resultToItem({ name: 'tar', section: '1', title: 'tar', description: '', highlights: [], anchorId: 'unrelated' }, {
      query: 'tar', distro: 'debian', runMan: vi.fn(),
    })
    expect(item.anchorId).toBeUndefined()
    expect(buildPaletteManHref('tar', '1', 'debian')).toBe('/man/tar/1')
  })

  it('encodes punctuation anchors once while preserving distro query parameters', () => {
    expect(buildPaletteManHref('tar', '1', 'debian', 'wildcards~2')).toBe('/man/tar/1#wildcards~2')
    expect(buildPaletteManHref('name/part', '3', 'fedora', '@#%')).toBe('/man/name%2Fpart/3?distro=fedora#%40%23%25')
  })

  it('uses native option hash navigation on the current page and reapplies an unchanged hash', () => {
    const location = { href: 'https://betterman.sh/man/tar/1?distro=ubuntu', pathname: '/man/tar/1', search: '?distro=ubuntu', hash: '' }
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { location, dispatchEvent })
    const push = vi.fn()
    const href = buildPaletteManHref('tar', '1', 'ubuntu', 'sort=')
    navigatePaletteMan(href, push)
    expect(location.hash).toBe('#sort%3D')
    expect(push).not.toHaveBeenCalled()
    expect(dispatchEvent).not.toHaveBeenCalled()
    navigatePaletteMan(href, push)
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'hashchange' }))
  })

  it('uses router navigation for a different man page, distro or a plain result', () => {
    vi.stubGlobal('window', { location: { href: 'https://betterman.sh/man/tar/1', pathname: '/man/tar/1', search: '', hash: '' } })
    const push = vi.fn()
    for (const href of ['/man/cp/1#opt-copy', '/man/tar/1?distro=ubuntu#opt-create', '/man/tar/1']) {
      navigatePaletteMan(href, push)
      expect(push).toHaveBeenLastCalledWith(href)
    }
  })
})
