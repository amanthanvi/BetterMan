import { Link } from '@tanstack/react-router'
import * as Sentry from '@sentry/react'
import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { getRuntimeConfig } from './runtimeConfig'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const dsn = import.meta.env.VITE_SENTRY_DSN || getRuntimeConfig()?.sentryDsn
    if (!dsn) return

    Sentry.withScope((scope) => {
      scope.setContext('react', { componentStack: errorInfo.componentStack })
      scope.setContext('route', {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      })
      Sentry.captureException(error)
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mx-auto max-w-3xl py-14">
        <div className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
          <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Error</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-sm text-[color:var(--bm-muted)]">
            This page crashed. You can retry or go back home.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
              onClick={() => window.location.reload()}
            >
              Retry this page
            </button>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
