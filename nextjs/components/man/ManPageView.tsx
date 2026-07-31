'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { SectionPage } from '../../lib/api'
import type { ManPage, ManPageContent, ManPageVariant, OptionItem } from '../../lib/docModel'
import { ChevronDownIcon } from '../icons'
import { DocRenderer } from '../doc/DocRenderer'
import { RecentPageRecorder } from '../recent/RecentPageRecorder'
import { useDistro } from '../state/distro'
import { useToc } from '../state/toc'
import { Toc } from '../toc/Toc'
import { IconButton } from '../ui/IconButton'
import { parseOptionTerms } from './find'
import { ManPageFindBar } from './ManPageFindBar'
import { ManPageFooterSections } from './ManPageFooterSections'
import { ManPageHeaderCard } from './ManPageHeaderCard'
import { ManPageOptionsSection, OPTIONS_COLLAPSE_THRESHOLD } from './ManPageOptionsSection'
import { useManPageFind } from './useManPageFind'

function getScrollBehavior(): 'auto' | 'smooth' {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function ManPageView({
  page,
  content,
  variants,
  relatedItems,
}: {
  page: ManPage
  content: ManPageContent
  variants: ManPageVariant[]
  relatedItems: SectionPage[]
}) {
  const toc = useToc()
  const { scrollToId, setScrollToId, setItems, setOpen: setTocOpen, sidebarOpen, setSidebarOpen } = toc
  const distro = useDistro()

  const manFind = useManPageFind({ blocks: content.blocks })

  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [flashAnchorId, setFlashAnchorId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const activeTocId = activeHeadingId ?? content.toc[0]?.id ?? null

  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  const optionsCount = content.options?.length ?? 0
  const [optionsExpanded, setOptionsExpanded] = useState(() => optionsCount <= OPTIONS_COLLAPSE_THRESHOLD)
  const flashTimeoutRef = useRef<number | null>(null)

  const optionTerms = useMemo(() => (selectedOption ? parseOptionTerms(selectedOption.flags) : []), [selectedOption])
  const shouldVirtualize = content.blocks.length >= 100

  const hasToc = (content.toc ?? []).length > 0
  const desktopSidebarExpanded = hasToc && sidebarOpen

  useEffect(() => {
    setItems(content.toc ?? [])
    return () => setItems([])
  }, [content.toc, setItems])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current != null) window.clearTimeout(copyTimeoutRef.current)
      if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  const flashOption = (anchorId: string) => {
    setFlashAnchorId(anchorId)
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = window.setTimeout(() => setFlashAnchorId(null), 1400)
  }

  useEffect(() => {
    setScrollToId((id) => {
      setActiveHeadingId(id)
      manFind.docRef.current?.scrollToAnchor(id)
    })
    return () => setScrollToId(null)
  }, [manFind.docRef, setScrollToId])

  useEffect(() => {
    if (shouldVirtualize) return

    const ids = content.toc.map((t) => t.id).filter(Boolean)
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))

    if (!els.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (!visible.length) return
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const target = visible[0]?.target
        const next = target instanceof HTMLElement ? target.id : ''
        if (next) setActiveHeadingId(next)
      },
      { root: null, threshold: [0, 1], rootMargin: '-20% 0px -70% 0px' },
    )

    for (const el of els) observer.observe(el)
    return () => observer.disconnect()
  }, [content.toc, shouldVirtualize, page.id])

  useEffect(() => {
    const options = content.options ?? []
    if (!options.length) return

    const byAnchor = new Map(options.map((o) => [o.anchorId, o]))

    const applyHash = () => {
      const raw = window.location.hash
      const anchorId = raw.startsWith('#') ? raw.slice(1) : raw
      if (!anchorId) return
      const opt = byAnchor.get(anchorId)
      if (!opt) return

      setOptionsExpanded(true)
      setSelectedOption(opt)
      flashOption(opt.anchorId)

      const scrollBehavior = getScrollBehavior()
      let attempts = 0
      const tick = () => {
        attempts += 1
        const el = document.getElementById(opt.anchorId)
        if (el) {
          el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
          return
        }
        if (attempts < 20) window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    }

    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [content.options, page.id])

  const copyLink = async () => {
    try {
      const url = new URL(window.location.href)
      if (distro.distro === 'debian') url.searchParams.delete('distro')
      else url.searchParams.set('distro', distro.distro)
      await navigator.clipboard.writeText(url.toString())
      setCopiedLink(true)
      if (copyTimeoutRef.current != null) window.clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = window.setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // ignore
    }
  }

  const openPrefs = () => {
    try {
      window.dispatchEvent(new CustomEvent('bm:prefs-request'))
    } catch {
      // ignore
    }
  }

  const onSelectOption = (opt: OptionItem) => {
    const scrollBehavior = getScrollBehavior()
    setSelectedOption((prev) => (prev?.anchorId === opt.anchorId ? null : opt))

    try {
      window.history.pushState(null, '', `#${opt.anchorId}`)
    } catch {
      try {
        window.location.hash = opt.anchorId
      } catch {
        // ignore
      }
    }

    flashOption(opt.anchorId)
    document.getElementById(opt.anchorId)?.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
  }

  const onFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && manFind.matchCount) {
      e.preventDefault()
      if (e.shiftKey) manFind.goPrev()
      else manFind.goNext()
    }
  }

  const gridCols = desktopSidebarExpanded
    ? 'lg:grid-cols-[16rem_minmax(0,1fr)]'
    : 'lg:grid-cols-[3rem_minmax(0,1fr)]'

  return (
    <div className="mx-auto max-w-6xl">
      <RecentPageRecorder name={page.name} section={page.section} description={page.description || page.title} />

      <ManPageHeaderCard
        page={page}
        synopsis={content.synopsis}
        variants={variants}
        distro={distro.distro}
        hasToc={hasToc}
        onOpenContents={() => setTocOpen(true)}
        onOpenFind={manFind.openFind}
        onOpenPrefs={openPrefs}
        onCopyLink={copyLink}
        copiedLink={copiedLink}
      />

      <ManPageFindBar
        open={manFind.findOpen}
        onClose={manFind.closeFind}
        find={manFind.find}
        findInputRef={manFind.findInputRef}
        onFindChange={manFind.onFindChange}
        onFindKeyDown={onFindKeyDown}
        findCountLabel={manFind.findCountLabel}
        matchCount={manFind.matchCount}
        onPrev={manFind.goPrev}
        onNext={manFind.goNext}
      />

      <div className={`mt-10 ${hasToc ? `lg:grid lg:items-start lg:gap-10 ${gridCols}` : ''}`}>
        {hasToc ? (
          <aside className="hidden lg:block lg:self-stretch">
            <div className="sticky top-20">
              <div data-bm-sidebar className="h-[calc(100dvh-6.5rem)] overflow-y-auto pr-2">
                {desktopSidebarExpanded ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs tracking-wide text-muted">Contents</div>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(false)}
                        aria-label="Collapse sidebar"
                        title="Collapse (b)"
                      >
                        <ChevronDownIcon className="size-4 rotate-90" />
                      </IconButton>
                    </div>

                    <div className="mt-3">
                      <Toc
                        items={content.toc}
                        activeId={activeTocId}
                        showTitle={false}
                        onNavigateToId={scrollToId ?? undefined}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-start justify-center pt-1">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarOpen(true)}
                      aria-label="Expand sidebar"
                      title="Expand (b)"
                    >
                      <ChevronDownIcon className="size-4 -rotate-90" />
                    </IconButton>
                  </div>
                )}
              </div>
            </div>
          </aside>
        ) : null}

        <article className="mx-auto min-w-0 max-w-[var(--bm-reading-column-width)] [font-family:var(--bm-reading-font-family)] [font-size:var(--bm-reading-font-size)] leading-[var(--bm-reading-line-height)]">
          <ManPageOptionsSection
            optionTerms={optionTerms}
            onClearHighlight={() => setSelectedOption(null)}
            options={content.options}
            optionsCount={optionsCount}
            optionsExpanded={optionsExpanded}
            onToggleOptionsExpanded={() => setOptionsExpanded((v) => !v)}
            selectedAnchorId={selectedOption?.anchorId}
            flashAnchorId={flashAnchorId}
            onSelectOption={onSelectOption}
          />

          <DocRenderer
            ref={manFind.docRef}
            blocks={content.blocks}
            distro={distro.distro}
            findQuery={manFind.findEnabled ? manFind.findQuery : undefined}
            optionTerms={optionTerms}
            onActiveHeadingChange={shouldVirtualize ? setActiveHeadingId : undefined}
          />

          <ManPageFooterSections distro={distro.distro} seeAlso={content.seeAlso} relatedItems={relatedItems} />
        </article>
      </div>
    </div>
  )
}
