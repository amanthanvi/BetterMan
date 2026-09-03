import { describe, expect, it } from 'vitest'

import { parseReleaseId } from './release'

describe('parseReleaseId', () => {
  it('splits a production id', () => {
    expect(parseReleaseId('2026-09-01T05:14:24Z+debian+2e579f1+mandoc:1.14.6-4')).toEqual({
      builtAt: '2026-09-01T05:14:24Z',
      distro: 'debian',
      gitSha: '2e579f1',
      mandocVersion: '1.14.6',
    })
  })

  it('tolerates an e2e id', () => {
    expect(parseReleaseId('e2e-debian-1788452936217')).toEqual({
      builtAt: null,
      distro: null,
      gitSha: null,
      mandocVersion: null,
    })
  })
})
