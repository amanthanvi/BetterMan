import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Component } from 'react'

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

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mx-auto max-w-2xl py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-[color:var(--bm-muted)]">
          This page crashed. You can retry or go back home.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8]"
            onClick={() => window.location.reload()}
          >
            Retry this page
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--bm-surface)]"
          >
            Go to Home
          </Link>
        </div>
      </div>
    )
  }
}

