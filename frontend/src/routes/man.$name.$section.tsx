import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useToc } from '../app/toc'
import { fetchManByNameAndSection, fetchRelated } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { ManPage, ManPageContent, OptionItem, SectionPage } from '../api/types'
import { recordRecentPage } from '../lib/recent'
import { DocRenderer } from '../man/DocRenderer'
import { countFindMatches, parseOptionTerms } from '../man/find'
import { OptionsTable } from '../man/OptionsTable'
import { Toc } from '../man/Toc'
import { rootRoute } from './__root'

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
    return (
      <div className="rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
        Page not found.{' '}
        <Link to="/search" search={{ q: name }} className="underline underline-offset-4">
          Search for “{name}”
        </Link>
        .
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
  const [find, setFind] = useState('')
  const [activeFindIndex, setActiveFindIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<OptionItem | null>(null)
  const activeMarkRef = useRef<HTMLElement | null>(null)

  const findQuery = find.trim()
  const findEnabled = findQuery.length >= 2
  const matchCount = findEnabled ? countFindMatches(content.blocks, findQuery) : 0
  const displayIndex = matchCount ? Math.min(activeFindIndex, matchCount - 1) : 0

  const optionTerms = selectedOption ? parseOptionTerms(selectedOption.flags) : []

  const scrollToFind = (idx: number) => {
    const marks = Array.from(document.querySelectorAll('mark[data-bm-find]')) as HTMLElement[]
    if (!marks.length) return
    const clamped = ((idx % marks.length) + marks.length) % marks.length
    const el = marks[clamped]
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
      <header className="border-b border-[var(--bm-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {page.name}({page.section})
        </h1>
        <p className="mt-2 text-base text-[color:var(--bm-muted)]">{page.description}</p>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color:var(--bm-muted)]">
          {page.sourcePackage ? (
            <div>
              Package: <span className="text-[color:var(--bm-fg)]">{page.sourcePackage}</span>
              {page.sourcePackageVersion ? (
                <span className="text-[color:var(--bm-muted)]"> {page.sourcePackageVersion}</span>
              ) : null}
            </div>
          ) : null}
          <div>
            Dataset: <span className="text-[color:var(--bm-fg)]">{page.datasetReleaseId}</span>
          </div>
        </div>

        {content.synopsis?.length ? (
          <div className="mt-5">
            <div className="text-xs font-medium uppercase tracking-wider text-[color:var(--bm-muted)]">
              Synopsis
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm leading-6">
              <code>{content.synopsis.join('\n')}</code>
            </pre>
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-[var(--bm-border)] bg-[var(--bm-surface)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
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
              placeholder="Find in page… (min 2 chars)"
              className="min-w-[16rem] flex-1 rounded-md border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
              aria-label="Find in page"
            />
            <div className="text-xs text-[color:var(--bm-muted)]">
              {matchCount ? (
                <>
                  {displayIndex + 1}/{matchCount}
                </>
              ) : findEnabled ? (
                '0/0'
              ) : (
                '—'
              )}
            </div>
            <button
              type="button"
              className="rounded-md border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.6] disabled:opacity-50"
              onClick={goPrev}
              disabled={!matchCount}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.6] disabled:opacity-50"
              onClick={goNext}
              disabled={!matchCount}
            >
              Next
            </button>
            {find ? (
              <button
                type="button"
                className="rounded-md border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.4] px-3 py-2 text-sm font-medium hover:bg-[color:var(--bm-bg)/0.6]"
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

          {optionTerms.length ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[color:var(--bm-muted)]">
              <div>
                Highlighting options: <span className="font-mono text-[color:var(--bm-fg)]">{optionTerms.join(' ')}</span>
              </div>
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setSelectedOption(null)}
              >
                Clear option highlights
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <Toc items={content.toc} />
        </aside>

        <article>
          {content.options?.length ? (
            <section className="mb-10">
              <h2 className="text-sm font-semibold tracking-tight">Options</h2>
              <div className="mt-3">
                <OptionsTable
                  options={content.options}
                  selectedAnchorId={selectedOption?.anchorId}
                  onSelect={(opt) => {
                    setSelectedOption((prev) => (prev?.anchorId === opt.anchorId ? null : opt))
                    document.getElementById(opt.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
          <h2 className="text-sm font-semibold tracking-tight">See also</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {content.seeAlso.slice(0, 24).map((ref) => (
              <li key={`${ref.name}:${ref.section ?? ''}`}>
                {ref.section ? (
                  <Link
                    to="/man/$name/$section"
                    params={{ name: ref.name, section: ref.section }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
                  >
                    {ref.name}({ref.section})
                  </Link>
                ) : (
                  <Link
                    to="/man/$name"
                    params={{ name: ref.name }}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
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
          <h2 className="text-sm font-semibold tracking-tight">Related</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {relatedItems.slice(0, 12).map((item) => (
              <li key={`${item.name}:${item.section}`}>
                <Link
                  to="/man/$name/$section"
                  params={{ name: item.name, section: item.section }}
                  className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[var(--bm-surface)] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.8]"
                >
                  {item.name}({item.section})
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  )
}
