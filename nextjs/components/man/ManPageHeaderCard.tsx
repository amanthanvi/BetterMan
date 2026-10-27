'use client'

import type { Distro } from '../../lib/distro'
import { DISTRO_LABEL, DISTRO_ORDER, normalizeDistro } from '../../lib/distro'
import type { ManPage, ManPageVariant } from '../../lib/docModel'
import { BookmarkButton } from '../bookmarks/BookmarkButton'
import { CheckIcon, CopyIcon, ListIcon, SearchIcon, SlidersIcon } from '../icons'
import { useDistro } from '../state/distro'
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
  const { setDistro } = useDistro()

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

          <IconButton onClick={onOpenFind} aria-label="Find in page" title="Find in page (F)">
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
            {/* Uncontrolled so the choice stays visible while the server renders it; the key
                resets it to whatever distro was actually served.
                bg-bg, not bg-transparent: Chromium draws the dropdown as its own page with a
                white body and copies this element's computed background-color and color onto
                the list, so a transparent select shows dark-theme ink on white. */}
            <select
              key={distro}
              name="distro"
              defaultValue={distro}
              onChange={(e) => {
                const next = normalizeDistro(e.target.value)
                if (next) setDistro(next)
              }}
              className="border-0 border-b border-edge bg-bg px-0.5 py-0.5 text-xs text-fg"
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
