import { describe, expect, it } from 'vitest'

import { makeT } from '../../lib/i18n/translate'
import { tServer } from '../../lib/i18n/testing'
import { sectionLabel } from './RunningHead'

describe('sectionLabel', () => {
  it('names sections 4 and 7 as the BSD manuals do on FreeBSD and macOS only', () => {
    expect(sectionLabel('4', tServer)).toBe('Special Files')
    expect(sectionLabel('7', tServer, 'debian')).toBe('Miscellany')
    for (const distro of ['freebsd', 'macos'] as const) {
      expect(sectionLabel('4', tServer, distro)).toBe('Kernel Interfaces')
      expect(sectionLabel('7', tServer, distro)).toBe('Miscellaneous Information')
      expect(sectionLabel('1', tServer, distro)).toBe('User Commands')
    }
  })

  it('translates the BSD names', () => {
    const t = makeT('de', { 'Kernel Interfaces': 'Kernel-Schnittstellen' }) as typeof tServer
    expect(sectionLabel('4', t, 'freebsd')).toBe('Kernel-Schnittstellen')
  })
})
