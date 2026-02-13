'use client'

import { usePathname, useSearchParams } from 'next/navigation'

import type { Distro } from '../../lib/distro'
import { DISTRO_LABEL, normalizeDistro } from '../../lib/distro'
import type { ManPage, ManPageVariant } from '../../lib/docModel'
import { BookmarkButton } from '../bookmarks/BookmarkButton'
import { CheckIcon, CopyIcon, ListIcon, SlidersIcon } from '../icons'

function buildVariantPicker(variants: ManPageVariant[]): { ordered: ManPageVariant[] } | null {
  const list = Array.isArray(variants) ? variants : []
  const uniqueContent = new Set(list.map((v) => v.contentSha256))
  if (list.length < 2) return null
  if (uniqueContent.size < 2) return null

  const order: Record<string, number> = { debian: 0, ubuntu: 1, fedora: 2 }
  const ordered = [...list].sort((a, b) => (order[a.distro] ?? 99) - (order[b.distro] ?? 99))
  return { ordered }
}

export function ManPageHeaderCard({
  page,
  synopsis,
  variants,
  distro,
  hasToc,
  onOpenContents,
  onOpenPrefs,
  onCopyLink,
  copiedLink,
}: {
  page: ManPage
  synopsis?: string[] | null
  variants: ManPageVariant[]
  distro: Distro
  hasToc: boolean
  onOpenContents: () => void
  onOpenPrefs: () => void
  onCopyLink: () => void
  copiedLink: boolean
}) {
  const variantPicker = buildVariantPicker(variants)

  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <header className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words font-mono text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">
              {page.name}({page.section})
            </h1>
            {page.description ? (
              <p className="mt-2 max-w-[70ch] text-base text-[color:var(--bm-muted)]">{page.description}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {hasToc ? (
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)] hover:text-[color:var(--bm-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35] lg:hidden"
                onClick={onOpenContents}
                aria-label="Open contents"
                title="Contents (b)"
              >
                <ListIcon className="size-4" />
              </button>
            ) : null}

            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] text-[color:var(--bm-muted)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)] hover:text-[color:var(--bm-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              onClick={onOpenPrefs}
              aria-label="Reading preferences"
              title="Reading preferences (P)"
            >
              <SlidersIcon className="size-4" />
            </button>

            <BookmarkButton name={page.name} section={page.section} description={page.description || page.title} />

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-2 text-sm font-medium text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              onClick={onCopyLink}
              aria-label="Copy link to clipboard"
              title={copiedLink ? 'Copied' : 'Copy link'}
            >
              {copiedLink ? <CheckIcon className="size-4 text-[var(--bm-accent)]" /> : <CopyIcon className="size-4" />}
              <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Copy link'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {variantPicker ? (
            <label className="inline-flex items-center gap-2 rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)]">
              <span>distro</span>
              <select
                value={distro}
                onChange={(e) => {
                  const next = normalizeDistro(e.target.value)
                  if (!next) return

                  try {
                    localStorage.setItem('bm-distro', next)
                  } catch {
                    // ignore
                  }

                  try {
                    document.cookie = `bm-distro=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`
                  } catch {
                    // ignore
                  }

                  const params = new URLSearchParams(searchParams.toString())
                  if (next === 'debian') params.delete('distro')
                  else params.set('distro', next)

                  const qs = params.toString()
                  const base = qs ? `${pathname}?${qs}` : pathname
                  const target = `${base}${window.location.hash || ''}`

                  try {
                    window.history.replaceState(null, '', target)
                  } catch {
                    // ignore
                  }

                  try {
                    window.location.assign(target)
                  } catch {
                    // ignore
                  }
                }}
                className="bg-transparent text-[color:var(--bm-fg)] outline-none"
                aria-label="Select distribution variant"
              >
                {variantPicker.ordered.map((v) => {
                  const normalized = normalizeDistro(v.distro)
                  if (!normalized) return null
                  return (
                    <option key={v.distro} value={normalized}>
                      {DISTRO_LABEL[normalized]}
                    </option>
                  )
                })}
              </select>
            </label>
          ) : null}

          {page.sourcePackage ? (
            <span className="min-w-0 max-w-full break-words rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)]">
              pkg <span className="text-[color:var(--bm-fg)]">{page.sourcePackage}</span>
              {page.sourcePackageVersion ? (
                <span className="text-[color:var(--bm-muted)]">@{page.sourcePackageVersion}</span>
              ) : null}
            </span>
          ) : null}

          <span className="min-w-0 max-w-full break-words rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)]">
            dataset <span className="text-[color:var(--bm-fg)]">{page.datasetReleaseId}</span>
          </span>
        </div>

        {synopsis?.length ? (
          <div>
            <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Synopsis</div>
            <pre
              className="mt-3 overflow-x-auto rounded-[var(--bm-radius)] border border-[var(--bm-code-border)] bg-[#0d0d0d] p-4 text-[13px] leading-[1.6] text-[color:var(--bm-code-fg)]"
              tabIndex={0}
            >
              <code>{synopsis.join('\n')}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </header>
  )
}
