'use client'

import type { Distro } from '../../lib/distro'
import { DISTRO_LABEL, DISTRO_ORDER, normalizeDistro } from '../../lib/distro'
import type { ManPage, ManPageVariant } from '../../lib/docModel'
import { BookmarkButton } from '../bookmarks/BookmarkButton'
import { useDistro } from '../state/distro'
import { ACTION_CLASS } from '../ui/action'
import { ManSectionLabel } from './RunningHead'

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
      <h1 className="break-words font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
        {page.name}
        <span className="ml-[0.08em] text-[0.5em] font-normal tracking-normal text-ink-3 oldstyle-nums">({page.section})</span>
      </h1>
      {page.description ? (
        <p className="mt-2.5 max-w-text font-serif text-lg italic text-ink-2 md:text-[1.375rem] md:leading-[1.35]">
          {page.description}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-ink-2">
        {variantPicker ? (
          <label className="inline-flex items-baseline gap-2">
            <span className="text-ink-3">System</span>
            {/* Uncontrolled so the choice stays visible while the server renders it; the key
                resets it to whatever distro was actually served.
                bg-paper, not bg-transparent: Chromium draws the dropdown as its own page with a
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
              className="border-0 border-b border-rule-2 bg-paper py-0.5 text-sm text-ink hover:border-accent"
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
        ) : (
          <span className="text-ink">{DISTRO_LABEL[distro]}</span>
        )}

        {page.sourcePackage ? (
          <span className="min-w-0 max-w-full break-words font-mono text-xs" title="Source package">
            {page.sourcePackage}
            {page.sourcePackageVersion ? ` ${page.sourcePackageVersion}` : null}
          </span>
        ) : null}

        {/* Inline and balanced, so a narrow screen wraps the actions evenly rather than orphaning the last. */}
        <div className="bm-js leading-7 text-balance md:ml-auto [&>*:not(:last-child)]:mr-5">
          {hasToc ? (
            <button type="button" onClick={onOpenContents} aria-label="Open contents" title="Contents (b)" className={`${ACTION_CLASS} lg:hidden`}>
              Contents
            </button>
          ) : null}
          <button type="button" onClick={onOpenFind} aria-label="Find in page" title="Find in page (f)" className={ACTION_CLASS}>
            Find
          </button>
          <button type="button" onClick={onOpenPrefs} aria-label="Reading preferences" title="Reading preferences (p)" className={ACTION_CLASS}>
            Preferences
          </button>
          <BookmarkButton name={page.name} section={page.section} description={page.description || page.title} />
          <button type="button" onClick={onCopyLink} aria-label="Copy link to clipboard" title={copiedLink ? 'Copied' : 'Copy link'} className={ACTION_CLASS}>
            Copy link
            {copiedLink ? (
              <span aria-hidden="true" className="bm-pop-in ml-1 inline-block text-accent no-underline motion-reduce:animate-none">
                ✓
              </span>
            ) : null}
            <span aria-live="polite" className="sr-only">
              {copiedLink ? 'Link copied' : ''}
            </span>
          </button>
        </div>
      </div>

      {synopsis?.length ? (
        <div className="mt-9">
          <ManSectionLabel as="h2">SYNOPSIS</ManSectionLabel>
          <pre tabIndex={0} role="group" aria-label="Synopsis" className="mt-1.5 overflow-x-auto pl-[1.75em] text-sm leading-[1.65]">
            <code>{synopsis.join('\n')}</code>
          </pre>
        </div>
      ) : null}
    </header>
  )
}
