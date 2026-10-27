import { describe, expect, it } from 'vitest'

import {
  canonicalWithDistro,
  DISTRO_GROUPS,
  DISTRO_LABEL,
  DISTROS,
  DISTRO_ORDER,
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

  it('carries the URL distro into links, Debian included, and leaves bare links bare', () => {
    expect(withDistro('/search?q=tar', null)).toBe('/search?q=tar')
    expect(withDistro('/search?q=tar', 'debian')).toBe('/search?q=tar&distro=debian')
    expect(withDistro('/search?q=tar', 'ubuntu')).toBe('/search?q=tar&distro=ubuntu')
    expect(withDistro('/man/tar/1#examples', 'arch')).toBe('/man/tar/1?distro=arch#examples')
    expect(withDistro('/search?q=tar&distro=ubuntu', 'debian')).toBe('/search?q=tar&distro=debian')
  })

  it('keeps Debian bare in canonical URLs', () => {
    expect(canonicalWithDistro('/man/tar/1', 'debian')).toBe('/man/tar/1')
    expect(canonicalWithDistro('/man/tar/1#examples', 'freebsd')).toBe('/man/tar/1?distro=freebsd#examples')
    expect(canonicalWithDistro('https://betterman.sh/man/tar/1', 'fedora')).toBe('https://betterman.sh/man/tar/1?distro=fedora')
  })

  it('builds man page links with the option anchor written as-is after the distro query', () => {
    expect(manPageHref('tar', '1', null)).toBe('/man/tar/1')
    expect(manPageHref('tar', '1', null, 'opt-create')).toBe('/man/tar/1#opt-create')
    expect(manPageHref('tar', '1', 'debian', 'opt-create')).toBe('/man/tar/1?distro=debian#opt-create')
    expect(manPageHref('tar', '1', 'arch', 'sort=')).toBe('/man/tar/1?distro=arch#sort=')
    expect(manPageHref('rsync', '1', null, 'no~2')).toBe('/man/rsync/1#no~2')
    expect(manPageHref('ssh_config', '5', null)).toBe('/man/ssh_config/5')
  })
})
