import * as Dialog from '@radix-ui/react-dialog'
import { createRootRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { CommandPalette } from '../app/CommandPalette'
import { TocProvider, useToc } from '../app/toc'
import { ThemeProvider, useTheme } from '../app/theme'
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
    <ThemeProvider>
      <TocProvider>
        <RootLayoutInner />
      </TocProvider>
    </ThemeProvider>
  )
}

function RootLayoutInner() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const toc = useToc()
  const theme = useTheme()

  const locationKey = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.search}${s.location.hash}`,
  })

  useEffect(() => {
    const h1 = document.querySelector('main h1') as HTMLElement | null
    if (!h1) return
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
    h1.focus({ preventScroll: true })
  }, [locationKey])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        theme.cycle()
        return
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'b' && toc.items.length) {
        e.preventDefault()
        toc.setOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [theme, toc])

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
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search commands…"
              className="w-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Search man pages"
            />
          </form>
          <button
            type="button"
            className="hidden rounded border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 text-xs text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.8] sm:block"
            onClick={() => setPaletteOpen(true)}
          >
            Ctrl/⌘ K
          </button>
          <button
            type="button"
            className="hidden items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.8] sm:inline-flex"
            onClick={() => theme.cycle()}
            title={`Theme: ${theme.mode}`}
          >
            Theme
          </button>
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
      {paletteOpen ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--bm-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs text-[color:var(--bm-muted)]">
          <div>BetterMan</div>
          <Link to="/licenses" className="underline underline-offset-4">
            Licenses
          </Link>
        </div>
      </footer>
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

function isTypingTarget(el: Element | null) {
  if (!el) return false
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range'].includes(el.type)
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement) return el.isContentEditable
  return false
}
