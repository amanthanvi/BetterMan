import * as Sentry from '@sentry/nextjs'
import { afterAll, describe, expect, it } from 'vitest'

import { scrubSentryEvent, scrubText, SENTRY_PRIVACY_HOOKS } from './sentryScrub'

const SENTINEL = 'BM_REVIEW_SENTINEL'

describe('Sentry privacy hooks', () => {
  it('redact cmd and q in URLs, query strings and query objects, keeping other parameters', () => {
    expect(scrubText(`https://betterman.sh/explain?cmd=echo%20${SENTINEL}&distro=fedora`)).toBe('https://betterman.sh/explain?cmd=[Filtered]&distro=fedora')
    expect(scrubText(`GET /search?section=1&q=${SENTINEL}`)).toBe('GET /search?section=1&q=[Filtered]')
    expect(scrubSentryEvent({ request: { query_string: `cmd=${SENTINEL}&x=1` } })).toEqual({ request: { query_string: 'cmd=[Filtered]&x=1' } })
    expect(scrubSentryEvent({ request: { query_string: [['q', SENTINEL], ['x', '1']] } })).toEqual({ request: { query_string: [['q', '[Filtered]'], ['x', '1']] } })
    expect(scrubSentryEvent({ data: { cmd: SENTINEL, other: 'kept' } })).toEqual({ data: { cmd: '[Filtered]', other: 'kept' } })
    // A raw (unencoded) line is redacted whole, to the next & or #, not just to its first space.
    expect(scrubText(`/explain?cmd=rm -rf "${SENTINEL}" x&distro=arch`)).toBe('/explain?cmd=[Filtered]&distro=arch')
    // Type-ahead's typed text.
    expect(scrubText(`/api/v1/suggest?name=${SENTINEL}&format=opensearch`)).toBe('/api/v1/suggest?name=[Filtered]&format=opensearch')
    // A percent-encoded nested URL, such as a redirect or referrer parameter.
    expect(scrubText(`/login?next=https%3A%2F%2Fbetterman.sh%2Fexplain%3Fcmd%3D${SENTINEL}%26distro%3Darch`)).toBe('/login?next=https%3A%2F%2Fbetterman.sh%2Fexplain%3Fcmd%3D[Filtered]%26distro%3Darch')
    expect(scrubSentryEvent({ request: { query_string: { name: SENTINEL, x: '1' } } })).toEqual({ request: { query_string: { name: '[Filtered]', x: '1' } } })
    // name stays an ordinary field elsewhere in a payload.
    expect(scrubSentryEvent({ sdk: { name: 'sentry.javascript.nextjs' } })).toEqual({ sdk: { name: 'sentry.javascript.nextjs' } })
  })
})

describe('Sentry envelopes (installed SDK, in-memory transport)', () => {
  const bodies: string[] = []
  afterAll(async () => {
    await Sentry.close(1000)
  })

  it('carry no cmd or q value from a client error, a navigation breadcrumb, a fetch breadcrumb, a span or the envelope header', async () => {
    Sentry.init({
      dsn: 'https://public@sentry.example.invalid/1',
      defaultIntegrations: false,
      tracesSampleRate: 1,
      ...SENTRY_PRIVACY_HOOKS,
      transport: (options: Parameters<typeof Sentry.createTransport>[0]) => Sentry.createTransport(options, async (request) => {
        bodies.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body))
        return { statusCode: 200 }
      }),
    })
    // What the browser's HttpContext integration adds to every client event.
    Sentry.addEventProcessor((event) => ({
      ...event,
      request: {
        url: `https://betterman.sh/explain?cmd=echo%20${SENTINEL}`,
        query_string: `cmd=echo%20${SENTINEL}`,
        headers: { Referer: `https://betterman.sh/?q=${SENTINEL}`, 'User-Agent': 'test' },
      },
    }))
    Sentry.addBreadcrumb({ category: 'navigation', data: { from: `/explain?cmd=${SENTINEL}`, to: `/search?q=${SENTINEL}&section=1` } })
    Sentry.addBreadcrumb({ category: 'fetch', type: 'http', data: { method: 'GET', url: `/api/v1/explain?cmd=${SENTINEL}`, status_code: 200 } })
    Sentry.captureException(new Error('client failure'))
    // A navigation span named from the URL, as browserTracing names one (source "url").
    Sentry.startSpan({ name: `/explain?cmd=${SENTINEL}`, op: 'navigation', attributes: { 'sentry.source': 'url', 'url.full': `https://betterman.sh/?q=${SENTINEL}` } }, () => {})
    await Sentry.flush(2000)

    const sent = bodies.join('\n')
    expect(sent).toContain('client failure')
    expect(sent).toContain('"category":"navigation"')
    expect(sent).toContain('"category":"fetch"')
    // This SDK streams spans; a browser without span streaming sends a transaction instead.
    expect(sent).toMatch(/"type":"(span|transaction)"/)
    expect(sent).toContain('[Filtered]')
    expect(sent).toContain('section=1')
    expect(sent).not.toContain(SENTINEL)
  })
})
