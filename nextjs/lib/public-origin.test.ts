import { afterEach, describe, expect, it, vi } from 'vitest'

import { getPublicOrigin } from './public-origin'

function requestWithForwardedHost(url = 'http://localhost:3000/robots.txt'): Request {
  return new Request(url, {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    },
  })
}

function clearPublicOriginEnv(): void {
  vi.stubEnv('PUBLIC_BASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getPublicOrigin', () => {
  it('uses PUBLIC_BASE_URL instead of hostile forwarded-host input in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh/')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')

    expect(getPublicOrigin(requestWithForwardedHost('http://internal:3000/robots.txt'))).toBe(
      'https://betterman.sh',
    )
  })

  it('uses NEXT_PUBLIC_BASE_URL as the validated secondary configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.betterman.sh')

    expect(getPublicOrigin(requestWithForwardedHost())).toBe('https://www.betterman.sh')
  })

  it('fails closed in production when no trusted public origin is configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    clearPublicOriginEnv()

    expect(() => getPublicOrigin(requestWithForwardedHost())).toThrow(/PUBLIC_BASE_URL/)
  })

  it('uses the request URL in development and ignores hostile forwarded-host input', () => {
    vi.stubEnv('NODE_ENV', 'development')
    clearPublicOriginEnv()

    expect(getPublicOrigin(requestWithForwardedHost())).toBe('http://localhost:3000')
  })

  it('uses only the ordinary host header for development metadata', () => {
    vi.stubEnv('NODE_ENV', 'development')
    clearPublicOriginEnv()

    const headers = new Headers({
      host: 'localhost:3000',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    })

    expect(getPublicOrigin({ headers })).toBe('http://localhost:3000')
  })

  it.each([
    'javascript:alert(1)',
    'https://user:password@betterman.sh',
    'https://betterman.sh/path',
    'https://betterman.sh?host=attacker.example',
  ])('rejects an invalid PUBLIC_BASE_URL: %s', (value) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_BASE_URL', value)
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')

    expect(() => getPublicOrigin(requestWithForwardedHost())).toThrow(/PUBLIC_BASE_URL/)
  })
})
