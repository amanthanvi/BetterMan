'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SectionPage } from '../../lib/api'
import type { ManPage, ManPageContent, ManPageVariant, OptionItem } from '../../lib/docModel'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { DocRenderer } from '../doc/DocRenderer'
import { RecentPageRecorder } from '../recent/RecentPageRecorder'
import { useDistro } from '../state/distro'
import { useToc } from '../state/toc'
import { parseOptionTerms } from './find'
import { ManPageFindBar } from './ManPageFindBar'
import { ManPageFooterSections } from './ManPageFooterSections'
import { ManPageHeaderCard } from './ManPageHeaderCard'
import { ManPageNavigatorOverlay } from './ManPageNavigatorOverlay'
import { ManPageOptionsSection } from './ManPageOptionsSection'
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
  const distro = useDistro()

  const manFind = useManPageFind({ blocks: content.blocks })

  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [flashAnchorId, setFlashAnchorId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const activeTocId = activeHeadingId ?? content.toc[0]?.id ?? null

  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const openNavigatorButtonRef = useRef<HTMLButtonElement | null>(null)

  const optionsCount = content.options?.length ?? 0
  const [optionsVisible, setOptionsVisible] = useState(() => optionsCount > 0 && optionsCount <= 160)
  const flashTimeoutRef = useRef<number | null>(null)

  const optionTerms = useMemo(() => (selectedOption ? parseOptionTerms(selectedOption.flags) : []), [selectedOption])
  const shouldVirtualize = content.blocks.length >= 100
  const showSidebar = toc.sidebarOpen

  useBodyScrollLock(showSidebar)

  const closeNavigator = useCallback(() => {
    openNavigatorButtonRef.current?.focus()
    toc.setSidebarOpen(false)
  }, [toc])

  const openNavigator = useCallback(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      if (toc.sidebarOpen) closeNavigator()
      else toc.setSidebarOpen(true)
      return
    }

    toc.setOpen(true)
  }, [closeNavigator, toc])

  useEffect(() => {
    toc.setItems(content.toc ?? [])
    return () => toc.setItems([])
  }, [content.toc, toc])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current != null) window.clearTimeout(copyTimeoutRef.current)
      if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!showSidebar) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      closeNavigator()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeNavigator, showSidebar])

  const flashOption = (anchorId: string) => {
    setFlashAnchorId(anchorId)
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = window.setTimeout(() => setFlashAnchorId(null), 1400)
  }

  useEffect(() => {
    toc.setScrollToId((id) => {
      setActiveHeadingId(id)
      manFind.docRef.current?.scrollToAnchor(id)
    })
    return () => toc.setScrollToId(null)
  }, [manFind.docRef, toc])

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

      setOptionsVisible(true)
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

  const quickJumps = useMemo(() => {
    const hay = content.toc.filter((t) => t.level === 2)
    const wanted = ['synopsis', 'description', 'options', 'examples', 'see also', 'see-also']

    const out: Array<{ id: string; title: string }> = []
    for (const w of wanted) {
      const hit = hay.find((t) => t.title.toLowerCase().includes(w))
      if (hit && !out.some((x) => x.id === hit.id)) out.push({ id: hit.id, title: hit.title })
    }

    return out.slice(0, 6)
  }, [content.toc])

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

  return (
    <div className="mx-auto max-w-6xl">
      <RecentPageRecorder name={page.name} section={page.section} description={page.description || page.title} />

      <ManPageNavigatorOverlay
        open={showSidebar}
        onClose={closeNavigator}
        quickJumps={quickJumps}
        onQuickJump={(id) => {
          if (!manFind.docRef.current) return false
          try {
            window.history.pushState(null, '', `#${id}`)
          } catch {
            try {
              window.location.hash = id
            } catch {
              // ignore
            }
          }
          manFind.docRef.current.scrollToAnchor(id, { behavior: getScrollBehavior() })
          return true
        }}
        findBarHidden={manFind.findBarHidden}
        onShowFind={() => {
          manFind.setFindBarHiddenPersisted(false)
          requestAnimationFrame(() => manFind.focusFindInput())
        }}
        onHideFind={() => manFind.setFindBarHiddenPersisted(true)}
        find={manFind.find}
        findInputRef={manFind.findInputDesktopRef}
        onFindChange={manFind.onFindChange}
        onFindKeyDown={(e) => {
          if (e.key === 'Enter' && manFind.matchCount) {
            e.preventDefault()
            if (e.shiftKey) manFind.goPrev()
            else manFind.goNext()
          }
        }}
        findCountLabel={manFind.findCountLabel}
        matchCount={manFind.matchCount}
        onPrev={manFind.goPrev}
        onNext={manFind.goNext}
        onClearFind={manFind.onClearFind}
        tocItems={content.toc}
        activeTocId={activeTocId}
        onTocNavigateToId={toc.scrollToId ?? undefined}
      />

      <ManPageHeaderCard
        page={page}
        synopsis={content.synopsis}
        variants={variants}
        distro={distro.distro}
        hasNavigator={toc.items.length > 0}
        onOpenNavigator={openNavigator}
        navigatorButtonRef={openNavigatorButtonRef}
        onOpenPrefs={openPrefs}
        onCopyLink={copyLink}
        copiedLink={copiedLink}
      />

      <div className="mt-10">
        <article className="mx-auto min-w-0 max-w-[var(--bm-reading-column-width)] [font-family:var(--bm-reading-font-family)] [font-size:var(--bm-reading-font-size)] leading-[var(--bm-reading-line-height)]">
          <ManPageFindBar
            hidden={manFind.findBarHidden}
            onShow={() => {
              manFind.setFindBarHiddenPersisted(false)
              requestAnimationFrame(() => manFind.focusFindInput())
            }}
            onHide={() => manFind.setFindBarHiddenPersisted(true)}
            find={manFind.find}
            findInputRef={manFind.findInputMobileRef}
            onFindChange={manFind.onFindChange}
            onFindKeyDown={(e) => {
              if (e.key === 'Enter' && manFind.matchCount) {
                e.preventDefault()
                if (e.shiftKey) manFind.goPrev()
                else manFind.goNext()
              }
            }}
            findCountLabel={manFind.findCountLabel}
            matchCount={manFind.matchCount}
            onPrev={manFind.goPrev}
            onNext={manFind.goNext}
          />

          <ManPageOptionsSection
            optionTerms={optionTerms}
            onClearHighlight={() => setSelectedOption(null)}
            options={content.options}
            optionsCount={optionsCount}
            optionsVisible={optionsVisible}
            onToggleOptionsVisible={() => setOptionsVisible((v) => !v)}
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
        </article>
      </div>

      <ManPageFooterSections distro={distro.distro} seeAlso={content.seeAlso} relatedItems={relatedItems} />
    </div>
  )
}
