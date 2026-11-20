import { expect, it, vi } from 'vitest'

import { GET } from './route'

it('disallows training and SEO backlink crawlers, and gives answer engines the public crawl policy with APIs disallowed and the sitemap', async () => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
  try {
    const res = await GET(new Request('https://betterman.sh/robots.txt'))
    const body = await res.text()
    for (const agent of ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', '*']) {
      expect(body).toContain(`User-agent: ${agent}\n`)
    }
    const [disallowed, publicPolicy] = body.split('\n\n')
    expect(disallowed).toBe(
      'User-agent: Bytespider\nUser-agent: CCBot\nUser-agent: SERankingBacklinksBot\nUser-agent: SemrushBot\nDisallow: /',
    )
    expect(publicPolicy).toContain('Allow: /\nDisallow: /api/\nSitemap: https://betterman.sh/sitemap.xml\n')
    expect(publicPolicy).not.toContain('Disallow: /\n')
  } finally {
    vi.unstubAllEnvs()
  }
})
