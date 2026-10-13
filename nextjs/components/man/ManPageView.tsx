'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { SectionPage } from '../../lib/api'
import type { ManPage, ManPageContent, ManPageVariant, OptionItem } from '../../lib/docModel'
import { getScrollBehavior, scrollToIdWhenRendered } from '../../lib/scroll'
import { ChevronDownIcon } from '../icons'
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
import { ManSectionLabel } from './RunningHead'
import { useManPageFind } from './useManPageFind'

export function ManPageView({
  page,
  content,
  variants,
  relatedItems,
  children,
}: {
  page: ManPage
  content: Omit<ManPageContent, 'blocks'>
  variants: ManPageVariant[]
  relatedItems: SectionPage[]
  children: ReactNode
}) {
  const toc = useToc()
  const { scrollToId, setScrollToId, setItems, setActiveId, setOpen: setTocOpen, sidebarOpen, setSidebarOpen } = toc
  const distro = useDistro()

  const bodyToc = content.toc
  const articleRef = useRef<HTMLDivElement | null>(null)

  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [flashAnchorId, setFlashAnchorId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const activeTocId = activeHeadingId ?? bodyToc[0]?.id ?? null

  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  const optionsCount = content.options?.length ?? 0
  const [optionsExpanded, setOptionsExpanded] = useState(() => optionsCount <= OPTIONS_COLLAPSE_THRESHOLD)
  const flashTimeoutRef = useRef<number | null>(null)

  const optionTerms = useMemo(() => (selectedOption ? parseOptionTerms(selectedOption.flags) : []), [selectedOption])
  const manFind = useManPageFind({ articleRef, optionTerms, documentKey: page.id })

  const hasToc = bodyToc.length > 0
  const desktopSidebarExpanded = hasToc && sidebarOpen

  useEffect(() => {
    setItems(bodyToc)
    return () => setItems([])
  }, [bodyToc, setItems])

  useEffect(() => {
    setActiveId(activeTocId)
  }, [activeTocId, setActiveId])

  useEffect(() => () => setActiveId(null), [setActiveId])

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
      scrollToIdWhenRendered(id, { behavior: getScrollBehavior(), block: 'start' })
    })
    return () => setScrollToId(null)
  }, [setScrollToId])

  // Ctrl/⌘+F from the app shell opens the custom find bar on man pages.
  const openFindRef = useRef(manFind.openFind)
  useEffect(() => {
    openFindRef.current = manFind.openFind
  })
  useEffect(() => {
    const onFindRequest = () => openFindRef.current()
    window.addEventListener('bm:find-request', onFindRequest)
    return () => window.removeEventListener('bm:find-request', onFindRequest)
  }, [])

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    // Query in document order, including nested headings. Index/offset estimates
    // are unnecessary now that every anchor remains mounted.
    const ids = new Set(bodyToc.map((item) => item.id))
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id], h5[id], h6[id]'))
      .filter((heading) => ids.has(heading.id))
    if (!headings.length) return

    const groups = new Map<HTMLElement, HTMLElement[]>()
    for (const heading of headings) {
      const block = heading.closest<HTMLElement>('[data-bm-block]') ?? heading
      const group = groups.get(block) ?? []
      group.push(heading)
      groups.set(block, group)
    }

    let frame = 0
    const update = () => {
      frame = 0
      const readingLine = Math.max(140, window.innerHeight * 0.2)
      let active = headings[0]!
      for (const [block, group] of groups) {
        const rect = block.getBoundingClientRect()
        if (rect.top > readingLine) break
        if (rect.bottom <= readingLine) {
          // A passed block's last heading wins without laying out its skipped
          // descendants. Read nested geometry only at the current reading line.
          active = group[group.length - 1]!
          continue
        }
        for (const heading of group) {
          if (heading.getBoundingClientRect().top > readingLine) break
          active = heading
        }
      }
      setActiveHeadingId(active.id)
    }
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const observer = new IntersectionObserver(scheduleUpdate, {
      root: null, threshold: [0, 1], rootMargin: '-20% 0px -70% 0px',
    })
    for (const heading of headings) observer.observe(heading)
    update()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [bodyToc, page.id])

  useEffect(() => {
    const byAnchor = new Map((content.options ?? []).map((option) => [option.anchorId, option]))
    const applyHash = () => {
      let anchorId: string
      try {
        anchorId = decodeURIComponent(window.location.hash.slice(1))
      } catch {
        return
      }
      if (!anchorId) return
      const option = byAnchor.get(anchorId)
      if (option) {
        setOptionsExpanded(true)
        setSelectedOption(option)
        flashOption(option.anchorId)
      }
      scrollToIdWhenRendered(anchorId, { behavior: 'auto', block: option ? 'center' : 'start' })
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

  const onSelectOption = (opt: OptionItem, event?: React.MouseEvent<HTMLAnchorElement>) => {
    // Keep pushState + smooth scroll as the single navigation path; native
    // anchor navigation would double-fire (jitter, extra history entry).
    event?.preventDefault()
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
    scrollToIdWhenRendered(opt.anchorId, { behavior: scrollBehavior, block: 'center' })
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
                      <ManSectionLabel as="h2">CONTENTS</ManSectionLabel>
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
                        items={bodyToc}
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

          <div ref={articleRef}>{children}</div>

          <ManPageFooterSections
            distro={distro.distro}
            seeAlso={content.seeAlso}
            relatedItems={relatedItems}
            hasParseWarnings={page.hasParseWarnings === true}
          />
        </article>
      </div>
    </div>
  )
}
