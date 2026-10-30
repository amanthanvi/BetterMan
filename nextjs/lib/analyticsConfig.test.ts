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

it('accepts the routes the prebuilt production deploy passes to its build', async () => {
  const { readFile } = await import('node:fs/promises')
  const script = await readFile(new URL('../../scripts/deploy-vercel.sh', import.meta.url), 'utf8')
  const raw = /^analytics_client_config='([^']+)'$/m.exec(script)?.[1]
  const build = /PUBLIC_BASE_URL=[^\n]*\\\n(?:[^\n]*\\\n)*\s*vercel build --prod/.exec(script)?.[0] ?? ''
  expect(build).toContain('VERCEL_ENV=production')
  expect(build).toContain('VERCEL_OBSERVABILITY_CLIENT_CONFIG="${VERCEL_OBSERVABILITY_CLIENT_CONFIG:-$analytics_client_config}"')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_OBSERVABILITY_CLIENT_CONFIG', raw ?? '')
  expect(analyticsConfig()).toEqual({ scriptSrc: '/_vercel/insights/script.js', eventEndpoint: '/_vercel/insights/event', viewEndpoint: '/_vercel/insights/view' })
})
