import { describe, expect, it } from 'vitest'

import { FastApiError, isReleaseNotFoundError, withDistroFallback } from './api'

describe('api error helpers', () => {
  it('identifies missing release errors by code', () => {
    const err = new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')

    expect(isReleaseNotFoundError(err)).toBe(true)
    expect(isReleaseNotFoundError(new FastApiError(404, 'PAGE_NOT_FOUND', 'Page not found'))).toBe(false)
  })

  it('falls back to Debian only for missing non-default releases', async () => {
    const calls: string[] = []
    const result = await withDistroFallback('ubuntu', async (distro) => {
      calls.push(distro)
      if (distro === 'ubuntu') {
        throw new FastApiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')
      }
      return `ok:${distro}`
    })

    expect(result).toEqual({ distro: 'debian', data: 'ok:debian' })
    expect(calls).toEqual(['ubuntu', 'debian'])
  })
})
