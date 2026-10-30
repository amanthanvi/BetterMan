import type { ReactNode } from 'react'

import { withDistro, type Distro } from '../../lib/distro'
import type { ReleaseInfo } from '../../lib/manRelease'
import { parseReleaseId } from '../../lib/release'
import { ThemeIcon } from '../icons'
import { Kbd } from '../ui/Kbd'

/** A fixed date, not "2 hours ago": the HTML is cached, and the man page script rewrites it as relative time. */
function updatedDate(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * The site header and footer for the plain-HTML man pages. It mirrors AppShell's
 * markup (the App Router shell), with `data-bm-action` hooks that the man page
 * script (man-client/) binds; every control that needs JavaScript is `bm-js`.
 */
export function ManShell({
  urlDistro,
  release,
  children,
}: {
  /** The URL's own `?distro=`; links carry it, and a bare URL keeps them bare. */
  urlDistro: Distro | null
  release: ReleaseInfo | null
  children: ReactNode
}) {
  const mandoc = release ? parseReleaseId(release.datasetReleaseId).mandocVersion : null
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-rule-2 focus:bg-raised focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header data-bm-app-header aria-label="Site header" className="sticky top-0 z-20 border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-page items-center gap-5 px-5 md:gap-10 md:px-12">
          <a href={withDistro('/', urlDistro)} aria-label="BetterMan home" className="bm-wm hover:text-ink">
            betterman<span>(1)</span>
          </a>

          <div aria-live="polite" className="sr-only" data-bm-live="theme" />
          <div aria-live="polite" className="sr-only" data-bm-live="notice" />
          <span role="status" aria-label="Navigation" className="sr-only" data-bm-live="navigation" />

          <button
            type="button"
            data-bm-action="palette"
            className="bm-js flex h-9 min-w-0 flex-1 items-center gap-3 border-b border-rule-2 text-left text-sm text-ink-3 hover:border-accent hover:text-ink md:max-w-96"
            aria-label="Search ⌘K"
            title="Command palette (Ctrl/⌘ K)"
          >
            <span className="truncate">Search</span>
            <Kbd className="ml-auto hidden md:inline-flex">⌘K</Kbd>
          </button>
          <a href={withDistro('/search', urlDistro)} className="bm-nojs text-sm text-ink-2 underline">
            Search
          </a>

          <button
            type="button"
            data-bm-action="theme"
            className="bm-js -mr-2 ml-auto inline-flex size-9 shrink-0 items-center justify-center text-ink-2 hover:text-ink"
            title="Theme: system (d)"
            aria-label="Cycle theme"
          >
            <ThemeIcon className="size-4" />
          </button>
        </div>

        <p data-bm-offline hidden className="mx-auto max-w-page border-t border-rule px-5 py-2 text-xs text-ink-2 md:px-12">
          Offline — showing cached content
        </p>
      </header>

      {/* clip, not hidden: hanging section numbers may overhang without making main a scroll container. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-page overflow-x-clip px-5 pb-10 outline-none md:px-12">
        {children}
      </main>

      <footer data-bm-app-footer aria-label="Site footer" className="mt-20 border-t border-rule">
        <div className="mx-auto flex max-w-page flex-wrap items-baseline gap-x-6 gap-y-2 px-5 pt-5 pb-10 text-sm text-ink-3 md:px-12">
          <span>
            <span className="bm-wm text-sm text-ink-2">betterman</span> · the Unix manual, typeset
          </span>
          {release ? (
            <span title={`Dataset ${release.datasetReleaseId}`}>
              {release.pageCount.toLocaleString('en-US')} pages · updated{' '}
              <time dateTime={release.lastUpdated} data-bm-relative-time>
                {updatedDate(release.lastUpdated)}
              </time>
              {mandoc ? ` · mandoc ${mandoc}` : ''}
            </span>
          ) : null}
          <a href={withDistro('/licenses', urlDistro)} className="underline">
            Licenses
          </a>
          <a href="https://github.com/amanthanvi/BetterMan" className="underline" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
