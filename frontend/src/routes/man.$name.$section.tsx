import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useToc } from '../app/toc'
import { ApiHttpError, fetchManByName, fetchManByNameAndSection, fetchRelated } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { ManPage, ManPageContent, OptionItem, SectionPage } from '../api/types'
import { recordRecentPage } from '../lib/recent'
import { DocRenderer } from '../man/DocRenderer'
import { countFindMatches, parseOptionTerms } from '../man/find'
import { OptionsTable } from '../man/OptionsTable'
import { Toc } from '../man/Toc'
import { rootRoute } from './__root'

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

export const manByNameAndSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/man/$name/$section',
  component: ManByNameAndSectionPage,
})

function ManByNameAndSectionPage() {
  const { name, section } = manByNameAndSectionRoute.useParams()
  const nameNorm = name.toLowerCase()
  const { setItems } = useToc()

  const pageQuery = useQuery({
    queryKey: queryKeys.man(nameNorm, section),
    queryFn: () => fetchManByNameAndSection(nameNorm, section),
  })

  const alternativesQuery = useQuery({
    queryKey: ['manAlternatives', nameNorm],
    enabled: pageQuery.isError && pageQuery.error instanceof ApiHttpError && pageQuery.error.status === 404,
    queryFn: () => fetchManByName(nameNorm),
    retry: false,
  })

  const relatedQuery = useQuery({
    queryKey: queryKeys.related(nameNorm, section),
    queryFn: () => fetchRelated(nameNorm, section),
    enabled: pageQuery.isSuccess,
  })

  const tocItems = pageQuery.data?.content.toc
  const recentId = pageQuery.data?.page.id
  const recentName = pageQuery.data?.page.name
  const recentSection = pageQuery.data?.page.section
  const recentDescription = pageQuery.data?.page.description

  useEffect(() => {
    setItems(tocItems ?? [])
    return () => setItems([])
  }, [setItems, tocItems])

  useEffect(() => {
    if (!recentId || !recentName || !recentSection) return
    recordRecentPage({
      name: recentName,
      section: recentSection,
      description: recentDescription,
    })
  }, [recentDescription, recentId, recentName, recentSection])

  if (pageQuery.isLoading) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  if (pageQuery.isError) {
    const alt = alternativesQuery.data
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        <div className="font-medium text-[color:var(--bm-fg)]">Page not found.</div>
        {alternativesQuery.isLoading ? (
          <div className="mt-2">Looking for alternatives…</div>
        ) : alt?.kind === 'ambiguous' && alt.options.length ? (
          <div className="mt-2 space-y-2">
            <div>Available sections:</div>
            <ul className="flex flex-wrap gap-2">
              {alt.options.map((opt) => (
                <li key={opt.section}>
                  <Link
                    to="/man/$name/$section"
                    params={{ name: nameNorm, section: opt.section }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg)/0.4] px-3 py-1 text-sm hover:bg-[color:var(--bm-bg)/0.6]"
                  >
                    {nameNorm}({opt.section})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : alt?.kind === 'page' ? (
          <div className="mt-2">
            Found{' '}
            <Link
              to="/man/$name/$section"
              params={{ name: alt.data.page.name, section: alt.data.page.section }}
              className="underline underline-offset-4"
            >
              {alt.data.page.name}({alt.data.page.section})
            </Link>{' '}
            instead.
          </div>
        ) : null}
        <div className="mt-3">
          <Link to="/search" search={{ q: nameNorm }} className="underline underline-offset-4">
            Search for “{nameNorm}”
          </Link>
          .
        </div>
      </div>
    )
  }

  if (!pageQuery.data) {
    return <div className="text-sm text-[color:var(--bm-muted)]">Loading…</div>
  }

  const { page, content } = pageQuery.data

  return (
    <ManPageView
      key={page.id}
      page={page}
      content={content}
      relatedItems={relatedQuery.data?.items ?? []}
    />
  )
}

function ManPageView({
  page,
  content,
  relatedItems,
}: {
  page: ManPage
  content: ManPageContent
  relatedItems: SectionPage[]
}) {
  const toc = useToc()
  const [find, setFind] = useState('')
  const [findBarHidden, setFindBarHidden] = useState(() => readStoredFindBarHidden())
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const [showAllRelated, setShowAllRelated] = useState(false)
  const activeMarkRef = useRef<HTMLElement | null>(null)
  const findInputDesktopRef = useRef<HTMLInputElement | null>(null)
  const findInputMobileRef = useRef<HTMLInputElement | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  const findQuery = find.trim()
  const findEnabled = findQuery.length >= 2
  const matchCount = findEnabled ? countFindMatches(content.blocks, findQuery) : 0
  const displayIndex = matchCount ? Math.min(activeFindIndex, matchCount - 1) : 0

  const optionTerms = selectedOption ? parseOptionTerms(selectedOption.flags) : []
  const showSidebar = toc.sidebarOpen
  const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  const setFindBarHiddenPersisted = (hidden: boolean) => {
    setFindBarHidden(hidden)
    writeStoredFindBarHidden(hidden)
  }

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current != null) window.clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    setActiveHeadingId(content.toc[0]?.id ?? null)

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
  }, [content.toc, page.id])

  const focusFindInput = () => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const el = isDesktop ? findInputDesktopRef.current : findInputMobileRef.current
    el?.focus()
    el?.select()
  }

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
    const marks = Array.from(document.querySelectorAll('mark[data-bm-find]')) as HTMLElement[]
    if (!marks.length) return
    const clamped = ((idx % marks.length) + marks.length) % marks.length
    const el = marks[clamped]
    el.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
    if (activeMarkRef.current) activeMarkRef.current.classList.remove('bm-find-active')
    el.classList.add('bm-find-active')
    activeMarkRef.current = el
  }

  const goPrev = () => {
    const marks = Array.from(document.querySelectorAll('mark[data-bm-find]'))
    if (!marks.length) return
    const idx = (activeFindIndex - 1 + marks.length) % marks.length
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  const goNext = () => {
    const marks = Array.from(document.querySelectorAll('mark[data-bm-find]'))
    if (!marks.length) return
    const idx = (activeFindIndex + 1) % marks.length
    setActiveFindIndex(idx)
    scrollToFind(idx)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rounded-3xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-4xl font-semibold leading-[1.05] tracking-tight">
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
            {page.sourcePackage ? (
              <span className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono">
                pkg {page.sourcePackage}
                {page.sourcePackageVersion ? `@${page.sourcePackageVersion}` : ''}
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 font-mono">
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
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
                  <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Navigator</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickJumps.map((j) => (
                      <a
                        key={j.id}
                        href={`#${j.id}`}
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs hover:bg-[color:var(--bm-bg)/0.55]"
                      >
                        {j.title}
                      </a>
                    ))}
                    {!quickJumps.length ? (
                      <span className="text-sm text-[color:var(--bm-muted)]">—</span>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Find</div>
                    {findBarHidden ? (
                      <button
                        type="button"
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                        onClick={() => {
                          setFindBarHiddenPersisted(false)
                          requestAnimationFrame(() => focusFindInput())
                        }}
                      >
                        Show
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
                        onClick={() => setFindBarHiddenPersisted(true)}
                      >
                        Hide
                      </button>
                    )}
                  </div>

                  {!findBarHidden ? (
                    <div className="mt-3 space-y-3">
                      <input
                        ref={findInputDesktopRef}
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
                            scrollToFind(activeFindIndex)
                          }
                        }}
                        placeholder="Find in page…"
                        className="w-full rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                        aria-label="Find in page"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--bm-muted)]">
                        <div className="font-mono">
                          {matchCount ? `${displayIndex + 1}/${matchCount}` : findEnabled ? '0/0' : '—'}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                            onClick={goPrev}
                            disabled={!matchCount}
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55] disabled:opacity-50"
                            onClick={goNext}
                            disabled={!matchCount}
                          >
                            Next
                          </button>
                          {find ? (
                            <button
                              type="button"
                              className="rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--bm-bg)/0.55]"
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
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] p-4 shadow-sm backdrop-blur">
                  <Toc items={content.toc} activeId={activeHeadingId} />
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <article className="min-w-0">
          <div className={`sticky top-16 z-10 lg:hidden ${findBarHidden ? 'mb-4' : 'mb-8'}`}>
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
                        scrollToFind(activeFindIndex)
                      }
                    }}
                    placeholder="Find in page…"
                    className="min-w-[14rem] flex-1 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                    aria-label="Find in page"
                  />
                  <div className="font-mono text-xs text-[color:var(--bm-muted)]">
                    {matchCount ? `${displayIndex + 1}/${matchCount}` : findEnabled ? '0/0' : '—'}
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
              <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Options</h2>
              <div className="mt-3">
                <OptionsTable
                  options={content.options}
                  selectedAnchorId={selectedOption?.anchorId}
                  onSelect={(opt) => {
                    setSelectedOption((prev) => (prev?.anchorId === opt.anchorId ? null : opt))
                    document.getElementById(opt.anchorId)?.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
                  }}
                />
              </div>
            </section>
          ) : null}

          <DocRenderer
            blocks={content.blocks}
            findQuery={findEnabled ? findQuery : undefined}
            optionTerms={optionTerms}
          />
        </article>
      </div>

      {content.seeAlso?.length ? (
        <aside className="mt-10">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">See also</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {content.seeAlso.slice(0, 24).map((ref) => (
              <li key={`${ref.name}:${ref.section ?? ''}`}>
                {ref.section && !ref.resolvedPageId ? (
                  <span
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.25] px-3 py-1 text-sm text-[color:var(--bm-muted)]"
                    title="Not available in this dataset"
                  >
                    {ref.name}({ref.section})
                  </span>
                ) : ref.section ? (
                  <Link
                    to="/man/$name/$section"
                    params={{ name: ref.name, section: ref.section }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                  >
                    {ref.name}({ref.section})
                  </Link>
                ) : (
                  <Link
                    to="/man/$name"
                    params={{ name: ref.name }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                  >
                    {ref.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {relatedItems.length ? (
        <aside className="mt-10">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Related</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {(showAllRelated ? relatedItems : relatedItems.slice(0, 5)).map((item) => (
              <li key={`${item.name}:${item.section}`}>
                <Link
                  to="/man/$name/$section"
                  params={{ name: item.name, section: item.section }}
                  className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                >
                  {item.name}({item.section})
                </Link>
              </li>
            ))}
          </ul>
          {relatedItems.length > 5 ? (
            <div className="mt-3">
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => setShowAllRelated((v) => !v)}
              >
                {showAllRelated ? 'Show fewer' : `Show all (${relatedItems.length})`}
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
