import { describe, expect, it } from 'vitest'

import { requestIdentifier } from './rateLimit'

describe('requestIdentifier', () => {
  it('ignores spoofable forwarding headers', () => {
    expect(
      requestIdentifier(
        new Headers({
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3',
        }),
      ),
    ).toBe('anonymous')
  })

  it('uses the leftmost Vercel-overwritten client address', () => {
    expect(requestIdentifier(new Headers({ 'x-vercel-forwarded-for': ' 9.9.9.9, 10.0.0.1 ' }))).toBe('9.9.9.9')
  })
})
