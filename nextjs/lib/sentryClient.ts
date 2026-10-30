import { PRIVATE_QUERY_PARAMS, SENTRY_PRIVACY_HOOKS } from './sentryScrub'

type SentryModule = typeof import('./sentrySdk')

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

// Errors seen before the SDK loads. A chunk that keeps failing leaves the
// listeners attached for the life of the tab, so the oldest are dropped.
const MAX_EARLY_ERRORS = 20
const earlyErrors: unknown[] = []

function bufferError(error: unknown) {
  earlyErrors.push(error)
  if (earlyErrors.length > MAX_EARLY_ERRORS) earlyErrors.shift()
}

const onError = (event: ErrorEvent) => bufferError(event.error ?? event.message)
const onRejection = (event: PromiseRejectionEvent) => bufferError(event.reason)

let sentry: Promise<SentryModule> | null = null

function loadSentry(): Promise<SentryModule> {
  sentry ??= import('./sentrySdk')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        // Only NEXT_PUBLIC_ variables reach the browser; Vercel exposes NEXT_PUBLIC_VERCEL_ENV.
        environment:
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        // cmd and q values never leave the page: request URLs, breadcrumbs, transactions.
        ...SENTRY_PRIVACY_HOOKS,
        // Preserve the pre-v11 defaults: v11 turns collection of user info,
        // cookies, headers, bodies, and query params on unless told otherwise.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: {
            request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
            response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
          },
          httpBodies: [],
          // cmd, q and name carry what a reader typed (explain, search, home, type-ahead).
          urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', ...PRIVATE_QUERY_PARAMS] },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          graphQL: { document: false, variables: false },
        },
      })
      // The SDK's own global handlers take over from here.
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      for (const error of earlyErrors.splice(0)) Sentry.captureException(error, { mechanism: { handled: false } })
      return Sentry
    })
    .catch((err: unknown) => {
      // Whether the chunk or init failed, the next capture tries again.
      sentry = null
      throw err
    })
  return sentry
}

/** Loads the SDK once the browser is idle, buffering errors until then. Without a DSN nothing loads. */
export function startClientErrorReporting(): void {
  if (!dsn) return
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  const load = () => {
    loadSentry().catch(() => {
      // Errors stay buffered; an error boundary capture retries the load.
    })
  }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load, { timeout: 3000 })
  else window.setTimeout(load, 3000)
}

export function captureClientException(error: unknown): void {
  if (!dsn) return
  loadSentry()
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => bufferError(error))
}
