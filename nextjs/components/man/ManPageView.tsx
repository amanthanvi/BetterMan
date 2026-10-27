'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { SectionPage } from '../../lib/api'
import type { Distro } from '../../lib/distro'
import type { BlockNode, HeadingBlock, ManPage, ManPageContent, ManPageVariant, OptionItem, TocItem } from '../../lib/docModel'
import { extractExamples } from '../../lib/examples'
import { FIND_REQUEST_EVENT } from '../../lib/dom'
import { getScrollBehavior, scrollToIdWhenRendered } from '../../lib/scroll'
import { ChevronDownIcon } from '../icons'
import { defaultCodeLanguage } from '../doc/CodeBlock'
import { DocRenderer } from '../doc/DocRenderer'
import { RecentPageRecorder } from '../recent/RecentPageRecorder'
import { useDistro } from '../state/distro'
import { useToc } from '../state/toc'
import { Toc } from '../toc/Toc'
import { IconButton } from '../ui/IconButton'
import { parseOptionTerms } from './find'
import { ManPageFindBar } from './ManPageFindBar'
import { ManPageExamples } from './ManPageExamples'
import { ManPageFooterSections } from './ManPageFooterSections'
import { ManPageHeaderCard } from './ManPageHeaderCard'
import { ManPageOptionsSection, OPTIONS_COLLAPSE_THRESHOLD } from './ManPageOptionsSection'
import { collectBlockIds, optionRowIds } from './optionAnchors'
import { ManSectionLabel } from './RunningHead'
import { useManPageFind } from './useManPageFind'

/**
 * The header shows NAME and the extracted synopsis lines. Drop NAME from the
 * body always. Drop SYNOPSIS only when it holds nothing the header lacks: a
 * single paragraph or code block and no subsections. tar(1) keeps its
 * "Traditional usage" subsections in the body.
 */
export function stripHeaderSections(
  blocks: BlockNode[],
  toc: TocItem[],
  opts: { hasSynopsis: boolean },
): { blocks: BlockNode[]; toc: TocItem[] } {
  const sections = splitSections(blocks)
  const removed = new Set<string>()
  const outBlocks: BlockNode[] = []

  for (const section of sections) {
    const title = section.heading?.text.trim().toUpperCase()
    const drop =
      title === 'NAME' ||
      (title === 'SYNOPSIS' && opts.hasSynopsis && isBareSynopsis(section.heading!.level, section.body))
    if (drop) {
      for (const block of [section.heading!, ...section.body]) {
        if (block.type === 'heading') removed.add(block.id)
      }
      continue
    }
    if (section.heading) outBlocks.push(section.heading)
    outBlocks.push(...section.body)
  }

  return { blocks: outBlocks, toc: toc.filter((item) => !removed.has(item.id)) }
}

type Section = { heading: HeadingBlock | null; body: BlockNode[] }

/** Group blocks under their nearest top-level heading. */
function splitSections(blocks: BlockNode[]): Section[] {
  const out: Section[] = []
  let current: Section = { heading: null, body: [] }
  let topLevel: number | null = null

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (topLevel === null) topLevel = block.level
      if (block.level <= topLevel) {
        if (current.heading || current.body.length) out.push(current)
        current = { heading: block, body: [] }
        continue
      }
    }
    current.body.push(block)
  }
  if (current.heading || current.body.length) out.push(current)
  return out
}

function isBareSynopsis(level: number, body: BlockNode[]): boolean {
  if (body.some((b) => b.type === 'heading' && b.level > level)) return false
  const content = body.filter((b) => b.type === 'paragraph' || b.type === 'code_block')
  return body.length === content.length && content.length <= 1
}

export function ManPageView({
  page,
  content,
  variants,
  servedDistro,
  relatedItems,
}: {
  page: ManPage
  content: ManPageContent
  variants: ManPageVariant[]
  /** The distro the server rendered, which differs from the preference after a fallback. */
  servedDistro: Distro
  relatedItems: SectionPage[]
}) {
  const toc = useToc()
  const { scrollToId, setScrollToId, setItems, setActiveId, setOpen: setTocOpen, sidebarOpen, setSidebarOpen } = toc
  const distro = useDistro()

  const examples = useMemo(() => extractExamples(content.blocks), [content.blocks])
  const codeLanguage = defaultCodeLanguage(page.section)

  const body = useMemo(
    () => stripHeaderSections(content.blocks, content.toc ?? [], { hasSynopsis: Boolean(content.synopsis?.length) }),
    [content.blocks, content.synopsis, content.toc],
  )
  const bodyIds = useMemo(() => collectBlockIds(body.blocks), [body.blocks])
  const optionRows = useMemo(() => optionRowIds(content.options ?? [], bodyIds), [bodyIds, content.options])
  const manFind = useManPageFind({ blocks: body.blocks })
  const { openFind } = manFind

  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [flashAnchorId, setFlashAnchorId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const activeTocId = activeHeadingId ?? body.toc[0]?.id ?? null

  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  const optionsCount = content.options?.length ?? 0
  const [optionsExpanded, setOptionsExpanded] = useState(() => optionsCount <= OPTIONS_COLLAPSE_THRESHOLD)
  const flashTimeoutRef = useRef<number | null>(null)

  const optionTerms = useMemo(() => (selectedOption ? parseOptionTerms(selectedOption.flags) : []), [selectedOption])

  const hasToc = body.toc.length > 0
  const desktopSidebarExpanded = hasToc && sidebarOpen

  useEffect(() => {
    setItems(body.toc)
    return () => setItems([])
  }, [body.toc, setItems])

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

  useEffect(() => {
    const ids = body.toc.map((t) => t.id).filter(Boolean)
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
  }, [body.toc, page.id])

  useEffect(() => {
    const options = content.options ?? []
    if (!options.length) return

    // `#<anchorId>` lands on the body definition (or the row, if the body has no
    // such id); `#<row id>` lands on the options-index row. Both select the option.
    const targets = new Map<string, { opt: OptionItem; targetId: string; isRow: boolean }>()
    for (const opt of options) {
      const rowId = optionRows.get(opt.anchorId)
      if (!rowId) continue
      targets.set(rowId, { opt, targetId: rowId, isRow: true })
      if (!targets.has(opt.anchorId)) {
        const inBody = bodyIds.has(opt.anchorId)
        targets.set(opt.anchorId, { opt, targetId: inBody ? opt.anchorId : rowId, isRow: !inBody })
      }
    }

    const applyHash = () => {
      const raw = window.location.hash.replace(/^#/, '')
      if (!raw) return
      let decoded = raw
      try {
        decoded = decodeURIComponent(raw)
      } catch {
        // keep the raw fragment
      }
      const target = targets.get(raw) ?? targets.get(decoded)
      if (!target) return

      setOptionsExpanded(true)
      setSelectedOption(target.opt)
      flashOption(target.opt.anchorId)

      scrollToIdWhenRendered(target.targetId, { behavior: getScrollBehavior(), block: target.isRow ? 'center' : 'start' })
    }

    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [bodyIds, content.options, optionRows, page.id])

  useEffect(() => {
    window.addEventListener(FIND_REQUEST_EVENT, openFind)
    return () => window.removeEventListener(FIND_REQUEST_EVENT, openFind)
  }, [openFind])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
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

  const onSelectOption = (opt: OptionItem, event: React.MouseEvent<HTMLAnchorElement>) => {
    // Modified and non-primary clicks keep the browser's link behavior (new tab, window, download).
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    // pushState below is the navigation; native hash navigation would repeat it.
    event.preventDefault()
    const scrollBehavior = getScrollBehavior()
    const rowId = event.currentTarget.id
    setSelectedOption((prev) => (prev?.anchorId === opt.anchorId ? null : opt))

    try {
      window.history.pushState(null, '', `#${rowId}`)
    } catch {
      try {
        window.location.hash = rowId
      } catch {
        // ignore
      }
    }

    flashOption(opt.anchorId)
    event.currentTarget.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
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
        distro={servedDistro}
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
                        items={body.toc}
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

        <article className="mx-auto w-full min-w-0 max-w-[var(--bm-reading-column-width)] [font-family:var(--bm-reading-font-family)] [font-size:var(--bm-reading-font-size)] leading-[var(--bm-reading-line-height)]">
          <ManPageExamples examples={examples} codeLanguage={codeLanguage} />

          <ManPageOptionsSection
            optionTerms={optionTerms}
            onClearHighlight={() => setSelectedOption(null)}
            options={content.options}
            rowIds={optionRows}
            optionsCount={optionsCount}
            optionsExpanded={optionsExpanded}
            onToggleOptionsExpanded={() => setOptionsExpanded((v) => !v)}
            selectedAnchorId={selectedOption?.anchorId}
            flashAnchorId={flashAnchorId}
            onSelectOption={onSelectOption}
          />

          <DocRenderer
            blocks={body.blocks}
            urlDistro={distro.urlDistro}
            findQuery={manFind.findEnabled ? manFind.findQuery : undefined}
            optionTerms={optionTerms}
            codeLanguage={codeLanguage}
          />

          <ManPageFooterSections
            urlDistro={distro.urlDistro}
            seeAlso={content.seeAlso}
            relatedItems={relatedItems}
            hasParseWarnings={page.hasParseWarnings === true}
          />
        </article>
      </div>
    </div>
  )
}
