import * as Sentry from '@sentry/nextjs'

import { PRIVATE_QUERY_PARAMS, SENTRY_PRIVACY_HOOKS } from './lib/sentryScrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
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

