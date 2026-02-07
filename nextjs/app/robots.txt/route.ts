import { getPublicOrigin } from '../../lib/public-origin'

export async function GET(request: Request) {
  const origin = getPublicOrigin(request)
  const body = [
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
