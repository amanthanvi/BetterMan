import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-[color:var(--bm-muted)]">
        That page doesn&apos;t exist.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--bm-surface)]"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <div className="min-h-dvh bg-[var(--bm-bg)] text-[var(--bm-fg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            BetterMan
          </Link>
          <div className="flex-1" />
          <div className="hidden text-xs text-[color:var(--bm-muted)] sm:block">
            <span className="rounded border border-[var(--bm-border)] px-2 py-1">
              Ctrl/⌘ K
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

