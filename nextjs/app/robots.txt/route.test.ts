import { expect, it, vi } from 'vitest'

import { GET } from './route'

it('gives answer engines the public crawl policy while keeping APIs disallowed and the sitemap', async () => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://betterman.sh')
  try {
    const res = await GET(new Request('https://betterman.sh/robots.txt'))
    const body = await res.text()
    for (const agent of ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', '*']) {
      expect(body).toContain(`User-agent: ${agent}\n`)
    }
    // One group applies equally to named agents and the wildcard, including .txt URLs.
    expect(body.split('\n\n')).toHaveLength(1)
    expect(body).toContain('Allow: /\nDisallow: /api/\nSitemap: https://betterman.sh/sitemap.xml\n')
    expect(body).not.toContain('Disallow: /\n')
  } finally {
    vi.unstubAllEnvs()
  }
})
