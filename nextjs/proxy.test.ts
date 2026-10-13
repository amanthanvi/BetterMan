import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from './proxy'

afterEach(() => vi.unstubAllEnvs())

describe('navigation cache context', () => {
  it.each(['true', 'false'])('reports the request cookie variant with CSP_ENABLED=%s', (enabled) => {
    vi.stubEnv('CSP_ENABLED', enabled)
    const request = new NextRequest('https://betterman.test/man/ls/1', {
      headers: { cookie: 'bm-distro=ubuntu; bm-theme-resolved=dark' },
    })
    const response = proxy(request)
    expect(response.headers.get('X-BM-Navigation-Context')).toBe(encodeURIComponent(JSON.stringify(['ubuntu', 'dark'])))
  })

  it('reports missing preferences consistently with Cookie Store', () => {
    const response = proxy(new NextRequest('https://betterman.test/'))
    expect(response.headers.get('X-BM-Navigation-Context')).toBe(encodeURIComponent(JSON.stringify(['', ''])))
  })
})
