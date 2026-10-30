import type { GetServerSidePropsContext } from 'next'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ComponentProps } from 'react'

// Every shipped explainer is approved; this copy of the data turns one into a draft
// so the draft path stays covered.
vi.mock('../../lib/concepts.generated.json', async (importOriginal) => {
  const real = (await importOriginal()) as { default: { concepts: { slug: string; status: string }[] } }
  const concepts = real.default.concepts.map((c) => (c.slug === 'globbing' ? { ...c, status: 'pending-owner', ownerSkim: null } : c))
  return { default: { concepts } }
})

import ConceptRoute, { getServerSideProps } from '../../pages/concept/[slug]'
import { sourceDistro } from './ConceptArticle'

afterEach(() => vi.unstubAllEnvs())

function context(slug: string, query: Record<string, string> = {}) {
  const headers: Record<string, string | number | string[]> = {}
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string | number | string[]) => {
      headers[key.toLowerCase()] = value
    },
  }
  const ctx = { params: { slug }, query, req: { headers: { host: 'betterman.sh', 'x-forwarded-proto': 'https' } }, res } as unknown as GetServerSidePropsContext
  return { ctx, res, headers }
}

describe('/concept/<slug>', () => {
  it('serves a published explainer as indexable plain HTML the CDN may keep', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '')
    const { ctx, res, headers } = context('signals')
    const result = (await getServerSideProps(ctx)) as { props: { head: { noindex: boolean; canonical: string } } }
    expect(res.statusCode).toBe(200)
    expect(headers['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(result.props.head.noindex).toBe(false)
    expect(result.props.head.canonical).toMatch(/\/\/betterman\.sh\/concept\/signals$/)
    const html = renderToStaticMarkup(<ConceptRoute {...(result.props as unknown as ComponentProps<typeof ConceptRoute>)} />)
    expect(html).toContain('checked against the pages it cites by a model panel and read by the maintainer')
    expect(html).not.toContain('not published')
  })

  it('answers an unpublished explainer with a cacheable 404 in man’s voice', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '')
    const { ctx, res, headers } = context('globbing')
    const result = await getServerSideProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(headers['cdn-cache-control']).toBe('public, s-maxage=600, stale-while-revalidate=3600')
    const html = renderToStaticMarkup(<ConceptRoute {...(result as { props: ComponentProps<typeof ConceptRoute> }).props} />)
    expect(html).toContain('No such file or directory')
    expect(html).not.toContain('Wildcards are not')
    expect((await getServerSideProps(context('no-such-concept').ctx)) as object).toMatchObject({ props: { kind: 'miss' } })
  })

  it('renders an opted-in draft as plain HTML that no cache keeps and no engine indexes', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '1')
    vi.stubEnv('CI', 'true')
    vi.stubEnv('VERCEL_ENV', '')
    const { ctx, res, headers } = context('globbing', { distro: 'freebsd' })
    const result = (await getServerSideProps(ctx)) as { props: { kind: string; head: { noindex: boolean; canonical: string } } }
    expect(res.statusCode).toBe(200)
    expect(headers['cache-control']).toBe('private, no-store')
    expect(headers['cdn-cache-control']).toBeUndefined()
    expect(result.props.head.noindex).toBe(true)
    expect(result.props.head.canonical).toMatch(/\/\/betterman\.sh\/concept\/globbing$/)
    const html = renderToStaticMarkup(<ConceptRoute {...(result.props as unknown as ComponentProps<typeof ConceptRoute>)} />)
    expect(html).toContain('not published')
    // glob(7) is not on FreeBSD, so the manual link stays on a distro that has it.
    expect(html).toContain('href="/man/glob/7"')
    expect(html).not.toContain('href="/man/glob/7?distro=freebsd"')
  })
})

describe('/concept/<slug> queries', () => {
  it('answers an off-list query privately, even a miss, so it never keys the CDN apart', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '')
    const { ctx, headers } = context('signals', { utm_source: 'x' })
    await getServerSideProps(ctx)
    expect(headers['cache-control']).toBe('private, no-store')
    expect(headers['cdn-cache-control']).toBeUndefined()
  })
})

describe('sourceDistro', () => {
  it('keeps the reader’s distro only where the source was read', () => {
    expect(sourceDistro({ distros: ['debian', 'freebsd'] }, 'freebsd')).toBe('freebsd')
    expect(sourceDistro({ distros: ['debian', 'ubuntu'] }, 'freebsd')).toBeNull()
    expect(sourceDistro({ distros: ['freebsd', 'macos'] }, 'arch')).toBe('freebsd')
    expect(sourceDistro({ distros: ['freebsd', 'macos'] }, null)).toBe('freebsd')
  })
})
