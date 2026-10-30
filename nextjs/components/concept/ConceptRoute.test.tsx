import type { GetServerSidePropsContext } from 'next'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ComponentProps } from 'react'

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
  it('answers an unpublished explainer with a cacheable 404 in man’s voice', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '')
    const { ctx, res, headers } = context('signals')
    const result = await getServerSideProps(ctx)
    expect(res.statusCode).toBe(404)
    expect(headers['cdn-cache-control']).toBe('public, s-maxage=600, stale-while-revalidate=3600')
    const html = renderToStaticMarkup(<ConceptRoute {...(result as { props: ComponentProps<typeof ConceptRoute> }).props} />)
    expect(html).toContain('No such file or directory')
    expect(html).not.toContain('SIGKILL')
  })

  it('renders an opted-in draft as plain HTML that no cache keeps and no engine indexes', async () => {
    vi.stubEnv('BETTERMAN_CONCEPT_DRAFTS', '1')
    vi.stubEnv('CI', 'true')
    vi.stubEnv('VERCEL_ENV', '')
    const { ctx, res, headers } = context('signals', { distro: 'freebsd' })
    const result = (await getServerSideProps(ctx)) as { props: { kind: string; head: { noindex: boolean; canonical: string } } }
    expect(res.statusCode).toBe(200)
    expect(headers['cache-control']).toBe('private, no-store')
    expect(headers['cdn-cache-control']).toBeUndefined()
    expect(result.props.head.noindex).toBe(true)
    expect(result.props.head.canonical).toMatch(/\/\/betterman\.sh\/concept\/signals$/)
    const html = renderToStaticMarkup(<ConceptRoute {...(result.props as unknown as ComponentProps<typeof ConceptRoute>)} />)
    expect(html).toContain('not published')
    // signal(7) is not on FreeBSD, so the manual link stays on a distro that has it.
    expect(html).toContain('href="/man/signal/7"')
    expect(html).not.toContain('href="/man/signal/7?distro=freebsd"')
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
