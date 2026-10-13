const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

// Deferred import: the Sentry browser SDK is the app's largest JS chunk and
// the error path is almost never used, so it must not tax the initial bundle.
// A single shared promise keeps error-boundary captures reliable: an error
// before the idle init triggers an immediate load and captures after init.
let sentryReady: Promise<typeof import('@sentry/nextjs')> | null = null

function loadSentry(): Promise<typeof import('@sentry/nextjs')> {
  if (!sentryReady) {
    sentryReady = import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.init({
          dsn: dsn || undefined,
          enabled: Boolean(dsn),
          environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
          tracesSampleRate: 0.1,
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
            urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
            queues: false,
            graphQL: { document: false, variables: false },
          },
        })
        return Sentry
      })
      .catch((err: unknown) => {
        // A failed chunk load must not wedge future captures.
        sentryReady = null
        throw err
      })
  }
  return sentryReady
}

if (typeof window !== 'undefined') {
  // Buffer pre-init browser errors (event-handler exceptions, unhandled
  // rejections) that React boundaries never see; replay after Sentry loads.
  const earlyErrors: unknown[] = []
  const onError = (event: ErrorEvent) => {
    earlyErrors.push(event.error ?? event.message)
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    earlyErrors.push(event.reason)
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
  }
  const flush = () =>
    void loadSentry()
      .then((Sentry) => {
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onRejection)
        for (const err of earlyErrors.splice(0)) Sentry.captureException(err)
      })
      .catch(() => {
        // Chunk load failed; keep the listeners for a later capture attempt.
      })

  if (w.requestIdleCallback) w.requestIdleCallback(flush, { timeout: 3000 })
  else window.setTimeout(flush, 0)
}

/** Capture an exception from an error boundary, initializing Sentry first if needed. */
export function captureClientException(error: unknown): void {
  void loadSentry()
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      // Telemetry must never throw into the error path that produced it.
    })
}
