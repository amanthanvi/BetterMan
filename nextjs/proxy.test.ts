import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { expect, it } from 'vitest'

import { config } from './proxy'

it.each(['/api', '/api/v1/info', '/api/v1/man/tar/1'])('skips API routes: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
})

it.each(['/', '/apiary', '/api-docs', '/man/api/3'])('sets CSP on pages: %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
})
