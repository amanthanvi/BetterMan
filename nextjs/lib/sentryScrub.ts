/**
 * Pasted command lines and searches travel in `cmd` and `q` (explain, search,
 * home). `dataCollection.urlQueryParams` does not cover every field an event
 * carries: the browser's HttpContext puts the full page URL in
 * `request.url`, breadcrumbs keep navigation and fetch URLs, and transaction
 * names and spans can hold a URL. These hooks redact both values everywhere in
 * an outgoing event or breadcrumb, in all three Sentry configs.
 */
/**
 * Query parameters that carry what a reader typed: explain's `cmd`, search's
 * and home's `q`, and type-ahead's `name` (`/api/v1/suggest`). One list feeds
 * this scrubber, every `dataCollection.urlQueryParams.deny` and the service
 * worker's cache exclusion, so they cannot drift apart.
 */
export const PRIVATE_QUERY_PARAMS = ['cmd', 'q', 'name'] as const
// Object keys redacted anywhere in a payload. `name` is a normal field in
// Sentry payloads (span, SDK, integration names), so it is URL-only.
const PRIVATE_KEYS = new Set(['cmd', 'q'])
const PRIVATE_PARAMS = new Set<string>(PRIVATE_QUERY_PARAMS)
const FILTERED = '[Filtered]'
const NAMES = PRIVATE_QUERY_PARAMS.join('|')
// A value runs to the next unencoded & or # or the end of the string, so a raw
// (unencoded) line with spaces or quotes is redacted whole.
const PRIVATE_PARAM = new RegExp(`([?&;#](?:${NAMES})=)[^&#]*`, 'gi')
// The same parameters inside a percent-encoded URL (a redirect or referrer
// parameter): ?cmd= written as %3Fcmd%3D, redacted to the next %26, & or #.
const ENCODED_PARAM = new RegExp(`((?:%3F|%26|%23)(?:${NAMES})%3D)(?:(?!%26|%23)[^&#])*`, 'gi')
const MAX_DEPTH = 12

/** Redacts typed values in any string that holds a URL or query string, including encoded nested URLs. */
export function scrubText(value: string): string {
  return value.replace(PRIVATE_PARAM, `$1${FILTERED}`).replace(ENCODED_PARAM, `$1${FILTERED}`)
}

function scrubQueryString(value: string): string {
  // A bare query string ("cmd=…&x=1") has no leading separator.
  return scrubText(`?${value}`).slice(1)
}

function scrubQueryObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((pair) => Array.isArray(pair) && typeof pair[0] === 'string' && PRIVATE_PARAMS.has(pair[0].toLowerCase()) ? [pair[0], FILTERED] : pair)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, PRIVATE_PARAMS.has(key.toLowerCase()) ? FILTERED : entry]))
  }
  return value
}

function scrub(value: unknown, key: string | null, depth: number): unknown {
  if (typeof value === 'string') {
    if (key !== null && PRIVATE_KEYS.has(key.toLowerCase())) return FILTERED
    return key === 'query_string' ? scrubQueryString(value) : scrubText(value)
  }
  if (key === 'query_string') return scrub(scrubQueryObject(value), null, depth + 1)
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value
  // Attachments and other binary payloads pass through untouched.
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value
  if (Array.isArray(value)) return value.map((item) => scrub(item, null, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [entryKey, entry] of Object.entries(value)) out[entryKey] = scrub(entry, entryKey, depth + 1)
  return out
}

export function scrubSentryEvent<T>(event: T): T {
  return scrub(event, null, 0) as T
}

type Envelope = [Record<string, unknown>, Array<[unknown, unknown]>]
type EnvelopeClient = { on(hook: 'beforeEnvelope', callback: (envelope: Envelope) => void): unknown }

/**
 * The last step before the transport: an envelope's own header carries the
 * trace context (`trace.transaction`, the root span's name), which no
 * before-send hook sees. Redacts the header and every item in place.
 */
export function sentryPrivacyIntegration() {
  return {
    name: 'BetterManPrivacy',
    setup(client: EnvelopeClient) {
      client.on('beforeEnvelope', (envelope) => {
        envelope[0] = scrubSentryEvent(envelope[0])
        for (const item of envelope[1]) {
          item[0] = scrubSentryEvent(item[0])
          item[1] = scrubSentryEvent(item[1])
        }
      })
    },
  }
}

/** Spread into every Sentry.init: errors, transactions, streamed spans and breadcrumbs. */
export const SENTRY_PRIVACY_HOOKS = {
  beforeSend: <T>(event: T) => scrubSentryEvent(event),
  beforeSendTransaction: <T>(event: T) => scrubSentryEvent(event),
  // Span streaming sends spans without a transaction event, so beforeSendTransaction never sees them.
  beforeSendSpan: <T>(span: T) => scrubSentryEvent(span),
  beforeBreadcrumb: <T>(breadcrumb: T) => scrubSentryEvent(breadcrumb),
  integrations: <T>(defaults: T[]) => [...defaults, sentryPrivacyIntegration() as unknown as T],
}
