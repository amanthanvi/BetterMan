import { afterEach, expect, it, vi } from 'vitest'
import { analyticsConfig } from './analyticsConfig'

afterEach(() => vi.unstubAllEnvs())
const valid = { scriptSrc: '/project-intake/script.js', eventEndpoint: '/project-intake/event', viewEndpoint: '/project-intake/view' }

it.each(['', '{', 'null', '[]', '{}', '{"analytics":null}', '{"analytics":{}}'])('rejects missing or malformed config (%s)', (raw) => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', raw)
  expect(analyticsConfig()).toBeNull()
})

it.each(['scriptSrc', 'eventEndpoint', 'viewEndpoint'])('rejects every unsafe %s', (key) => {
  vi.stubEnv('VERCEL_ENV', 'production')
  for (const value of [null, 42, '', 'script.js', '//evil.example/script.js', 'https://betterman.sh/script.js', 'https://evil.example/script.js', '/\\evil.example/script.js', '/script.js?q=secret', '/script.js#x', '/a/../script.js', '/a/ script.js']) {
    vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { ...valid, [key]: value } }))
    expect(analyticsConfig(), `${key}: ${value}`).toBeNull()
  }
})

it('accepts only the configured same-origin paths and optional endpoints', () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { ...valid, unrelated: 'ignored' } }))
  expect(analyticsConfig()).toEqual(valid)
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: { scriptSrc: valid.scriptSrc } }))
  expect(analyticsConfig()).toEqual({ scriptSrc: valid.scriptSrc })
})

it.each(['preview', 'development', ''])('rejects valid config outside production (%s)', (env) => {
  vi.stubEnv('VERCEL_ENV', env)
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics: valid }))
  expect(analyticsConfig()).toBeNull()
})
