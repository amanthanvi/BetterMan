'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { Distro } from '../../lib/distro'
import { DISTRO_LABEL, DISTRO_ORDER, normalizeDistro } from '../../lib/distro'
import type { ManPage, ManPageVariant } from '../../lib/docModel'
import { BookmarkButton } from '../bookmarks/BookmarkButton'
import { CheckIcon, CopyIcon, ListIcon, SearchIcon, SlidersIcon } from '../icons'
import { IconButton } from '../ui/IconButton'
import { ManSectionLabel, RunningHead, sectionLabel } from './RunningHead'

function buildVariantPicker(variants: ManPageVariant[]): { ordered: ManPageVariant[] } | null {
  const list = Array.isArray(variants) ? variants : []
  const uniqueContent = new Set(list.map((v) => v.contentSha256))
  if (list.length < 2) return null
  if (uniqueContent.size < 2) return null

  const ordered = [...list].sort((a, b) => (DISTRO_ORDER[a.distro as Distro] ?? 99) - (DISTRO_ORDER[b.distro as Distro] ?? 99))
  return { ordered }
}

export function ManPageHeaderCard({
  page,
  synopsis,
  variants,
  distro,
  hasToc,
  onOpenContents,
  onOpenFind,
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
  onOpenFind: () => void
  onOpenPrefs: () => void
  onCopyLink: () => void
  copiedLink: boolean
}) {
  const variantPicker = buildVariantPicker(variants)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <header>
      <RunningHead title={`${page.name.toUpperCase()}(${page.section})`} label={sectionLabel(page.section)} />

      <div className="mt-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="break-words font-mono text-2xl font-semibold leading-tight tracking-tight">
            {page.name}
            <span className="text-muted">({page.section})</span>
          </h1>
          {page.description ? <p className="mt-1 max-w-[70ch] text-base text-muted">{page.description}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {hasToc ? (
            <IconButton onClick={onOpenContents} aria-label="Open contents" title="Contents (b)" className="lg:hidden">
              <ListIcon className="size-4" />
            </IconButton>
          ) : null}

          <IconButton onClick={onOpenFind} aria-label="Find in page" title="Find in page">
            <SearchIcon className="size-4" />
          </IconButton>

          <IconButton onClick={onOpenPrefs} aria-label="Reading preferences" title="Reading preferences (P)">
            <SlidersIcon className="size-4" />
          </IconButton>

          <BookmarkButton name={page.name} section={page.section} description={page.description || page.title} />

          <IconButton onClick={onCopyLink} aria-label="Copy link to clipboard" title={copiedLink ? 'Copied' : 'Copy link'}>
            {copiedLink ? <CheckIcon className="bm-pop-in size-4 text-accent motion-reduce:animate-none" /> : <CopyIcon className="size-4" />}
            <span aria-live="polite" className="sr-only">
              {copiedLink ? 'Link copied' : ''}
            </span>
          </IconButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-xs text-faint">
        {variantPicker ? (
          <label className="inline-flex items-center gap-1.5">
            <span>distro</span>
            <select
              name="distro"
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
                router.replace(`${base}${window.location.hash || ''}`)
              }}
              className="border-0 border-b border-edge bg-transparent px-0.5 py-0.5 text-xs text-fg"
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

        {variantPicker ? null : <span className="text-muted">{DISTRO_LABEL[distro]}</span>}

        {page.sourcePackage ? (
          <span className="min-w-0 max-w-full break-words" title="Source package">
            <span className="text-muted">{page.sourcePackage}</span>
            {page.sourcePackageVersion ? <span> {page.sourcePackageVersion}</span> : null}
          </span>
        ) : null}
      </div>

      {synopsis?.length ? (
        <div className="mt-8">
          <ManSectionLabel as="h2">SYNOPSIS</ManSectionLabel>
          <pre className="mt-2 overflow-x-auto bg-code-bg p-4 text-sm leading-[1.6] text-fg" tabIndex={0}>
            <code>{synopsis.join('\n')}</code>
          </pre>
        </div>
      ) : null}
    </header>
  )
}
