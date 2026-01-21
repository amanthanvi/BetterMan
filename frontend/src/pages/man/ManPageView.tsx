import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { DISTRO_LABEL, normalizeDistro, useDistro, writeUrlDistro } from '../../app/distro'
import { useToc } from '../../app/toc'
import type { ManPage, ManPageContent, ManPageVariant, OptionItem, SectionPage } from '../../api/types'
import { DocRenderer, type DocRendererHandle } from '../../man/DocRenderer'
import { parseOptionTerms } from '../../man/find'
import { OptionsTable } from '../../man/OptionsTable'
import { buildFindIndex, locateFindMatch } from './findIndex'
import { ManPageFooterSections } from './ManPageFooterSections'
import { ManPageSidebar } from './ManPageSidebar'

const FIND_BAR_KEY = 'bm-find-bar-hidden'

function readStoredFindBarHidden(): boolean {
  try {
    return localStorage.getItem(FIND_BAR_KEY) === '1'
  } catch {
    // ignore
  }
  return false
}

function writeStoredFindBarHidden(hidden: boolean) {
  try {
    localStorage.setItem(FIND_BAR_KEY, hidden ? '1' : '0')
  } catch {
    // ignore
  }
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
  const [find, setFind] = useState('')
  const [findBarHidden, setFindBarHidden] = useState(() => readStoredFindBarHidden())
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [flashAnchorId, setFlashAnchorId] = useState<string | null>(null)
  const activeMarkRef = useRef<HTMLElement | null>(null)
  const findInputDesktopRef = useRef<HTMLInputElement | null>(null)
  const findInputMobileRef = useRef<HTMLInputElement | null>(null)
  const docRef = useRef<DocRendererHandle | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const activeTocId = activeHeadingId ?? content.toc[0]?.id ?? null
  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const optionsCount = content.options?.length ?? 0
  const [optionsVisible, setOptionsVisible] = useState(() => optionsCount > 0 && optionsCount <= 160)
  const flashTimeoutRef = useRef<number | null>(null)

  const rawFindQuery = find.trim()
  const deferredFindQuery = useDeferredValue(rawFindQuery)
  const findQuery = rawFindQuery.length >= 2 ? rawFindQuery : ''
  const findEnabled = findQuery.length >= 2
  const findStable = deferredFindQuery === rawFindQuery
  const stableFindQuery = deferredFindQuery.length >= 2 ? deferredFindQuery : ''
  const findIndex = useMemo(
    () => (stableFindQuery.length >= 2 ? buildFindIndex(content.blocks, stableFindQuery) : null),
    [content.blocks, stableFindQuery],
  )
  const matchCount = findStable ? (findIndex?.total ?? 0) : 0
  const displayIndex = matchCount ? Math.min(activeFindIndex, matchCount - 1) : 0
  const findCountLabel =
    rawFindQuery.length < 2
      ? '—'
      : !findStable
        ? '…'
        : matchCount
          ? `${displayIndex + 1}/${matchCount}`
          : '0/0'

  const optionTerms = useMemo(
    () => (selectedOption ? parseOptionTerms(selectedOption.flags) : []),
    [selectedOption],
  )
  const isVirtualized = content.blocks.length >= 100
  const setScrollToId = toc.setScrollToId
  const showSidebar = toc.sidebarOpen
  const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const setFindBarHiddenPersisted = (hidden: boolean) => {
    setFindBarHidden(hidden)
    writeStoredFindBarHidden(hidden)
  }

  const variantPicker = useMemo(() => {
    const list = Array.isArray(variants) ? variants : []
    const uniqueContent = new Set(list.map((v) => v.contentSha256))
    if (list.length < 2) return null
    if (uniqueContent.size < 2) return null

    const order: Record<string, number> = { debian: 0, ubuntu: 1, fedora: 2 }
    const ordered = [...list].sort((a, b) => (order[a.distro] ?? 99) - (order[b.distro] ?? 99))
    return { ordered }
  }, [variants])

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
      docRef.current?.scrollToAnchor(id)
    })
    return () => setScrollToId(null)
  }, [setScrollToId])

  useEffect(() => {
    if (isVirtualized) return

    const ids = content.toc.map((t) => t.id).filter(Boolean)
    const els = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[]

    if (!els.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (!visible.length) return
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const next = (visible[0]?.target as HTMLElement | undefined)?.id
        if (next) setActiveHeadingId(next)
      },
      {
        root: null,
        threshold: [0, 1],
        rootMargin: '-20% 0px -70% 0px',
      },
    )

    for (const el of els) observer.observe(el)
    return () => observer.disconnect()
  }, [content.toc, isVirtualized, page.id])

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
  }, [content.options, page.id, scrollBehavior])

  const focusFindInput = () => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const el = isDesktop ? findInputDesktopRef.current : findInputMobileRef.current
    el?.focus()
    el?.select()
  }

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

  const scrollToFind = (idx: number) => {
    if (!matchCount) return
    const clamped = ((idx % matchCount) + matchCount) % matchCount

    if (docRef.current?.isVirtualized && findIndex) {
      const loc = locateFindMatch(findIndex.prefixByBlock, clamped)
      if (!loc) return

      docRef.current.scrollToBlockIndex(loc.blockIndex, { align: 'center', behavior: scrollBehavior })

      let attempts = 0
      const tick = () => {
        attempts += 1
        const block = document.querySelector(`[data-bm-block-index="${loc.blockIndex}"]`) as HTMLElement | null
        const marks = block
          ? (Array.from(block.querySelectorAll('mark[data-bm-find]')) as HTMLElement[])
          : []
        if (marks.length) {
          const el = marks[Math.min(loc.withinBlockIndex, marks.length - 1)]!
          el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
          if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
          el.classList.add('bm-find-active')
          activeMarkRef.current = el
          return
        }
        if (attempts < 20) window.requestAnimationFrame(tick)
      }

      window.requestAnimationFrame(tick)
      return
    }

    const marks = Array.from(document.querySelectorAll('mark[data-bm-find]')) as HTMLElement[]
    if (!marks.length) return
    const el = marks[Math.min(clamped, marks.length - 1)]!
    el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    el.classList.add('bm-find-active')
    activeMarkRef.current = el
  }

  const goPrev = () => {
    if (!matchCount) return
    const idx = (activeFindIndex - 1 + matchCount) % matchCount
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  const goNext = () => {
    if (!matchCount) return
    const idx = (activeFindIndex + 1) % matchCount
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="break-words font-mono text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">
                {page.name}({page.section})
              </h1>
              <p className="mt-3 max-w-[70ch] text-base text-[color:var(--bm-muted)]">
                {page.description}
              </p>
            </div>

            <button
              type="button"
              className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
              onClick={copyLink}
              aria-label="Copy link to clipboard"
              title={copiedLink ? 'Copied' : 'Copy link'}
            >
              {copiedLink ? 'Copied' : 'Copy link'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--bm-muted)]">
            {variantPicker ? (
              <label className="flex items-center gap-2 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono">
                <span className="text-[color:var(--bm-muted)]">distro</span>
                <select
                  value={distro.distro}
                  onChange={(e) => {
                    const next = normalizeDistro(e.target.value)
                    if (!next) return
                    distro.setDistro(next)
                    writeUrlDistro(next)
                  }}
                  className="bg-transparent text-[color:var(--bm-fg)] outline-none"
                  aria-label="Select distribution variant"
                >
                  {variantPicker.ordered.map((v) => {
                    const normalized = normalizeDistro(v.distro)
                    if (!normalized) return null
                    return (
                      <option key={v.distro} value={v.distro}>
                        {DISTRO_LABEL[normalized]}
                      </option>
                    )
                  })}
                </select>
              </label>
            ) : null}
            {page.sourcePackage ? (
              <span className="min-w-0 max-w-full break-words rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono">
                pkg {page.sourcePackage}
                {page.sourcePackageVersion ? `@${page.sourcePackageVersion}` : ''}
              </span>
            ) : null}
            <span className="min-w-0 max-w-full break-words rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono">
              dataset {page.datasetReleaseId}
            </span>
          </div>

          {content.synopsis?.length ? (
            <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.25] p-4">
              <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Synopsis</div>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.65] p-4 text-sm leading-6">
                <code>{content.synopsis.join('\n')}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </header>

      <div className={`mt-10 grid gap-10 ${showSidebar ? 'lg:grid-cols-[19rem_minmax(0,1fr)]' : ''}`}>
        {showSidebar ? (
          <ManPageSidebar
            quickJumps={quickJumps}
            onQuickJump={(id) => {
              if (!docRef.current) return false
              try {
                window.history.pushState(null, '', `#${id}`)
              } catch {
                try {
                  window.location.hash = id
                } catch {
                  // ignore
                }
              }
              docRef.current?.scrollToAnchor(id, { behavior: scrollBehavior })
              return true
            }}
            findBarHidden={findBarHidden}
            onShowFind={() => {
              setFindBarHiddenPersisted(false)
              requestAnimationFrame(() => focusFindInput())
            }}
            onHideFind={() => setFindBarHiddenPersisted(true)}
            find={find}
            findInputRef={findInputDesktopRef}
            onFindChange={(next) => {
              setFind(next)
              setActiveFindIndex(0)
              if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
              activeMarkRef.current = null
            }}
            onFindKeyDown={(e) => {
              if (e.key === 'Enter' && matchCount) {
                e.preventDefault()
                if (e.shiftKey) goPrev()
                else goNext()
              }
            }}
            findCountLabel={findCountLabel}
            matchCount={matchCount}
            onPrev={goPrev}
            onNext={goNext}
            onClearFind={() => {
              setFind('')
              setActiveFindIndex(0)
              if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
              activeMarkRef.current = null
            }}
            tocItems={content.toc}
            activeTocId={activeTocId}
            onTocNavigateToId={toc.scrollToId ?? undefined}
          />
        ) : null}

        <article className="min-w-0">
          <div data-bm-findbar className={`sticky top-16 z-10 lg:hidden ${findBarHidden ? 'mb-4' : 'mb-8'}`}>
            {findBarHidden ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-4 py-2 text-sm font-medium hover:bg-[color:var(--bm-surface)/0.9]"
                  onClick={() => {
                    setFindBarHiddenPersisted(false)
                    requestAnimationFrame(() => focusFindInput())
                  }}
                >
                  Find
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={findInputMobileRef}
                    value={find}
                    onChange={(e) => {
                      setFind(e.target.value)
                      setActiveFindIndex(0)
                      if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
                      activeMarkRef.current = null
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && matchCount) {
                        e.preventDefault()
                        if (e.shiftKey) goPrev()
                        else goNext()
                      }
                    }}
                    placeholder="Find in page…"
                    className="min-w-[14rem] flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                    aria-label="Find in page"
                  />
                  <div className="font-mono text-xs text-[color:var(--bm-muted)]">
                    {findCountLabel}
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                    onClick={goPrev}
                    disabled={!matchCount}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                    onClick={goNext}
                    disabled={!matchCount}
                  >
                    Next
                  </button>
                  {find ? (
                    <button
                      type="button"
                      className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                      onClick={() => {
                        setFind('')
                        setActiveFindIndex(0)
                        if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
                        activeMarkRef.current = null
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                    onClick={() => setFindBarHiddenPersisted(true)}
                  >
                    Hide
                  </button>
                </div>
              </div>
            )}
          </div>

          {optionTerms.length ? (
            <div className="mb-8 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">
                    Highlighting options
                  </div>
                  <div className="mt-2 font-mono text-sm text-[color:var(--bm-fg)]">
                    {optionTerms.join(' ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                  onClick={() => setSelectedOption(null)}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {content.options?.length ? (
            <section className="mb-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">
                  Options{optionsCount ? <span className="text-[color:var(--bm-muted)]"> · {optionsCount}</span> : null}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-2 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                  onClick={() => setOptionsVisible((v) => !v)}
                >
                  {optionsVisible ? 'Hide' : 'Show'}
                </button>
              </div>

              {optionsVisible ? (
                <div className="mt-3">
                  <OptionsTable
                    options={content.options}
                    selectedAnchorId={selectedOption?.anchorId}
                    onSelect={(opt) => {
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
                      document.getElementById(opt.anchorId)?.scrollIntoView({
                        behavior: scrollBehavior,
                        block: 'center',
                      })
                    }}
                    flashAnchorId={flashAnchorId}
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.6] p-4 text-sm text-[color:var(--bm-muted)] shadow-sm">
                  This man page has a large options table. Expand it if you need to jump to a flag.
                </div>
              )}
            </section>
          ) : null}

          <DocRenderer
            ref={docRef}
            blocks={content.blocks}
            findQuery={findEnabled ? findQuery : undefined}
            optionTerms={optionTerms}
            onActiveHeadingChange={isVirtualized ? setActiveHeadingId : undefined}
          />
        </article>
      </div>

      <ManPageFooterSections seeAlso={content.seeAlso} relatedItems={relatedItems} />
    </div>
  )
}
