import { describe, expect, it } from 'vitest'

import { DISTRO_GROUPS, DISTRO_LABEL, DISTROS, isDefaultDistro, normalizeDistro, withDistro } from './distro'

describe('distro helpers', () => {
  it('normalizes supported distros and rejects unsupported values', () => {
    expect(normalizeDistro(' Debian ')).toBe('debian')
    expect(normalizeDistro('ARCH')).toBe('arch')
    expect(normalizeDistro('freebsd')).toBe('freebsd')
    expect(normalizeDistro('solaris')).toBeNull()
    expect(normalizeDistro(undefined)).toBeNull()
  })

  it('keeps distro metadata complete and ordered', () => {
    expect(DISTROS).toEqual(['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'])
    expect(DISTRO_GROUPS).toEqual([
      { label: 'Linux', items: ['debian', 'ubuntu', 'fedora', 'arch', 'alpine'] },
      { label: 'BSD', items: ['freebsd', 'macos'] },
    ])
    expect(DISTRO_LABEL.macos).toBe('macOS (BSD)')
  })

  it('applies distro query params only for non-default distros', () => {
    expect(isDefaultDistro('debian')).toBe(true)
    expect(isDefaultDistro('ubuntu')).toBe(false)

    expect(withDistro('/search?q=tar', 'debian')).toBe('/search?q=tar')
    expect(withDistro('/search?q=tar', 'ubuntu')).toBe('/search?q=tar&distro=ubuntu')
    expect(withDistro('/man/tar/1#examples', 'arch')).toBe('/man/tar/1?distro=arch#examples')
    expect(withDistro('https://betterman.sh/man/tar/1', 'freebsd')).toBe(
      'https://betterman.sh/man/tar/1?distro=freebsd',
    )
  })
})
