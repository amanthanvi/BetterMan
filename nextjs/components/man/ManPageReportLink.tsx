'use client'

import { useSyncExternalStore } from 'react'

import type { Distro } from '../../lib/distro'
import { reportProblemHref, type ReportedPage } from '../../lib/reportProblem'

const noSubscription = () => () => {}

export function ManPageReportLink({ page, distro }: { page: ReportedPage; distro: Distro }) {
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => null)
  return (
    <p>
      <a
        href={reportProblemHref({ page, distro, origin })}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted underline decoration-edge-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-accent"
      >
        Report a problem
      </a>{' '}
      with this page on GitHub.
    </p>
  )
}
