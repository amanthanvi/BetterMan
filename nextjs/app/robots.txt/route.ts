import { getStaticPublicOrigin } from '../../lib/public-origin'

export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET() {
  // Static metadata must use the configured canonical origin, never request headers.
  const origin = getStaticPublicOrigin()
  const body = [
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: ChatGPT-User',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /',
    '',
    'User-agent: anthropic-ai',
    'Disallow: /',
    '',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'User-agent: Google-Extended',
    'Disallow: /',
    '',
    'User-agent: PerplexityBot',
    'Disallow: /',
    '',
    'User-agent: Bytespider',
    'Disallow: /',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
