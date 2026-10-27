import { afterEach, expect, it, vi } from 'vitest'

import { GET } from './route'
import { isRateLimited } from '../../lib/rateLimit'

vi.mock('../../lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))

afterEach(() => vi.unstubAllEnvs())

it('describes search and suggestions on the public origin', async () => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')

  const res = await GET(new Request('http://internal.invalid/opensearch.xml'))
  const body = await res.text()

  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/opensearchdescription+xml; charset=utf-8')
  expect(body).toContain('<ShortName>BetterMan</ShortName>')
  expect(body).toContain('<Url type="text/html" method="get" template="https://betterman.sh/search?q={searchTerms}"/>')
  expect(body).toContain(
    '<Url type="application/x-suggestions+json" method="get" template="https://betterman.sh/api/v1/suggest?q={searchTerms}&amp;format=opensearch"/>',
  )
  expect(body).toContain('template="https://betterman.sh/opensearch.xml"')
  expect(isRateLimited).toHaveBeenCalledWith(expect.any(Headers), 'page')
})

it('keeps the descriptor under the page rate limit', async () => {
  vi.mocked(isRateLimited).mockResolvedValueOnce(true)
  const res = await GET(new Request('https://betterman.sh/opensearch.xml'))
  expect(res.status).toBe(429)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
})
