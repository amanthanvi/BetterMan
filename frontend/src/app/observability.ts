import * as Sentry from '@sentry/react'
import { getRuntimeConfig } from './runtimeConfig'

let sentryInitialized = false

export function initSentry(router: unknown) {
  const dsn = import.meta.env.VITE_SENTRY_DSN || getRuntimeConfig()?.sentryDsn
  if (!dsn || sentryInitialized) return
  sentryInitialized = true

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    tracePropagationTargets: [/^\/api\//],
  })
}
