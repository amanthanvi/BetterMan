import { getPublicOrigin } from '../../lib/public-origin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const origin = getPublicOrigin(request)
  const body = [
    'User-agent: Bytespider',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'User-agent: ChatGPT-User',
    'User-agent: OAI-SearchBot',
    'User-agent: ClaudeBot',
    'User-agent: Claude-SearchBot',
    'User-agent: Claude-User',
    'User-agent: anthropic-ai',
    'User-agent: Google-Extended',
    'User-agent: PerplexityBot',
    'User-agent: Perplexity-User',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
