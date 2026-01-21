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

let plausibleInitialized = false

export function initPlausible() {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN || getRuntimeConfig()?.plausibleDomain
  if (!domain || plausibleInitialized) return
  plausibleInitialized = true

  const existing = document.querySelector('script[data-bm-plausible="1"]')
  if (existing) return

  const script = document.createElement('script')
  script.defer = true
  script.setAttribute('data-domain', domain)
  script.setAttribute('data-bm-plausible', '1')
  script.src = 'https://plausible.io/js/script.js'
  document.head.appendChild(script)
}
