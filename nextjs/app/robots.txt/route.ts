export async function GET(request: Request) {
  const origin = new URL(request.url).origin
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

