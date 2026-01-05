import * as Dialog from '@radix-ui/react-dialog'
import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { TocProvider, useToc } from '../app/toc'
import { Toc } from '../man/Toc'

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
    <TocProvider>
      <RootLayoutInner />
    </TocProvider>
  )
}

function RootLayoutInner() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const toc = useToc()

  return (
    <div className="min-h-dvh bg-[var(--bm-bg)] text-[var(--bm-fg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.85] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            BetterMan
          </Link>
          <form
            className="hidden flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault()
              const query = q.trim()
              if (!query) return
              navigate({ to: '/search', search: { q: query } })
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search commands…"
              className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Search man pages"
            />
          </form>
          <div className="hidden text-xs text-[color:var(--bm-muted)] sm:block">
            <span className="rounded border border-[var(--bm-border)] px-2 py-1">
              Ctrl/⌘ K
            </span>
          </div>
          {toc.items.length ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8] sm:hidden"
              onClick={() => toc.setOpen(true)}
            >
              TOC
            </button>
          ) : null}
        </div>
      </header>

      <TocDrawer />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function TocDrawer() {
  const toc = useToc()

  return (
    <Dialog.Root open={toc.open} onOpenChange={toc.setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-40 w-[min(90vw,24rem)] overflow-y-auto border-r border-[var(--bm-border)] bg-[var(--bm-bg)] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold tracking-tight">
              Table of contents
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8]"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4">
            <Toc items={toc.items} showTitle={false} onNavigate={() => toc.setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
