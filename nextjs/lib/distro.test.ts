import { describe, expect, it } from 'vitest'

import {
  canonicalLinkDistro,
  DISTRO_GROUPS,
  DISTRO_LABEL,
  DISTROS,
  DISTRO_ORDER,
  distroParam,
  manPageHref,
  normalizeDistro,
  withDistro,
} from './distro'

describe('distro helpers', () => {
  it('normalizes supported distros and rejects unsupported values', () => {
    expect(normalizeDistro(' Debian ')).toBe('debian')
    expect(normalizeDistro('ARCH')).toBe('arch')
    expect(normalizeDistro('freebsd')).toBe('freebsd')
    expect(normalizeDistro(' macOS ')).toBe('macos')
    expect(normalizeDistro('solaris')).toBeNull()
    expect(normalizeDistro(undefined)).toBeNull()
  })

  it('keeps distro metadata complete and ordered', () => {
    expect(DISTROS).toEqual(['debian', 'ubuntu', 'fedora', 'arch', 'alpine', 'freebsd', 'macos'])
    expect(DISTRO_ORDER).toEqual({
      debian: 0,
      ubuntu: 1,
      fedora: 2,
      arch: 3,
      alpine: 4,
      freebsd: 5,
      macos: 6,
    })
    expect(DISTRO_GROUPS).toEqual([
      { label: 'Linux', items: ['debian', 'ubuntu', 'fedora', 'arch', 'alpine'] },
      { label: 'BSD', items: ['freebsd', 'macos'] },
    ])
    expect(DISTRO_LABEL.alpine).toBe('Alpine')
    expect(DISTRO_LABEL.freebsd).toBe('FreeBSD')
    expect(DISTRO_LABEL.macos).toBe('macOS (BSD-licensed subset)')
  })

  it('applies distro query params only for non-default distros', () => {
    expect(withDistro('/search?q=tar', canonicalLinkDistro('debian'))).toBe('/search?q=tar')
    expect(withDistro('/search?q=tar', canonicalLinkDistro('ubuntu'))).toBe('/search?q=tar&distro=ubuntu')
    expect(withDistro('/man/tar/1#examples', canonicalLinkDistro('arch'))).toBe('/man/tar/1?distro=arch#examples')
    expect(withDistro('/man/tar/1#examples', canonicalLinkDistro('freebsd'))).toBe('/man/tar/1?distro=freebsd#examples')
    expect(withDistro('https://betterman.sh/man/tar/1', canonicalLinkDistro('fedora'))).toBe(
      'https://betterman.sh/man/tar/1?distro=fedora',
    )
  })

  it('keeps Debian explicit for a reader whose stored default is another distro', () => {
    expect(distroParam({ distro: 'debian', preferred: 'debian' })).toBeNull()
    expect(distroParam({ distro: 'debian', preferred: 'ubuntu' })).toBe('debian')
    expect(distroParam({ distro: 'ubuntu', preferred: 'ubuntu' })).toBe('ubuntu')
    expect(distroParam({ distro: 'macos', preferred: 'debian' })).toBe('macos')
    expect(withDistro('/man/gzip/1', { distro: 'debian', preferred: 'ubuntu' })).toBe('/man/gzip/1?distro=debian')
    expect(manPageHref('tar', '1', { distro: 'debian', preferred: 'macos' }, 'opt-create')).toBe(
      '/man/tar/1?distro=debian#opt-create',
    )
  })

  it('builds man page links with the option anchor written as-is after the distro query', () => {
    expect(manPageHref('tar', '1', canonicalLinkDistro('debian'))).toBe('/man/tar/1')
    expect(manPageHref('tar', '1', canonicalLinkDistro('debian'), 'opt-create')).toBe('/man/tar/1#opt-create')
    expect(manPageHref('tar', '1', canonicalLinkDistro('arch'), 'sort=')).toBe('/man/tar/1?distro=arch#sort=')
    expect(manPageHref('rsync', '1', canonicalLinkDistro('debian'), 'no~2')).toBe('/man/rsync/1#no~2')
    expect(manPageHref('ssh_config', '5', canonicalLinkDistro('debian'))).toBe('/man/ssh_config/5')
  })
})
