import { afterEach, describe, expect, it, vi } from 'vitest'

import { getPublicOrigin } from './public-origin'

const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL
const originalNextPublicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL
const originalRailwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN
afterEach(() => {
  vi.unstubAllEnvs()
  restoreEnv('PUBLIC_BASE_URL', originalPublicBaseUrl)
  restoreEnv('NEXT_PUBLIC_BASE_URL', originalNextPublicBaseUrl)
  restoreEnv('RAILWAY_PUBLIC_DOMAIN', originalRailwayPublicDomain)
})

describe('getPublicOrigin', () => {
  it('prefers the configured canonical production origin', () => {
    process.env.PUBLIC_BASE_URL = 'https://betterman.sh/path'
    process.env.NEXT_PUBLIC_BASE_URL = 'https://www.betterman.sh'

    expect(getPublicOrigin(new Request('https://deployment.vercel.app/robots.txt'))).toBe('https://betterman.sh')
  })

  it('uses trusted platform forwarding headers when no canonical origin is configured', () => {
    delete process.env.PUBLIC_BASE_URL
    delete process.env.NEXT_PUBLIC_BASE_URL
    process.env.RAILWAY_PUBLIC_DOMAIN = 'stale-legacy.up.railway.app'
    vi.stubEnv('NODE_ENV', 'development')

    const request = new Request('http://internal/robots.txt', {
      headers: {
        'x-forwarded-host': 'betterman.sh',
        'x-forwarded-proto': 'https',
      },
    })

    expect(getPublicOrigin(request)).toBe('https://betterman.sh')
  })

  it('does not trust forwarding headers when production configuration is missing', () => {
    delete process.env.PUBLIC_BASE_URL
    delete process.env.NEXT_PUBLIC_BASE_URL
    vi.stubEnv('NODE_ENV', 'production')

    const request = new Request('https://deployment.vercel.app/robots.txt', {
      headers: {
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      },
    })

    expect(getPublicOrigin(request)).toBe('https://deployment.vercel.app')
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
