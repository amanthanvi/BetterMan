import { getPublicOrigin } from '../../lib/public-origin'
import { isRateLimited } from '../../lib/rateLimit'

export const dynamic = 'force-dynamic'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

export async function GET(request: Request) {
  if (await isRateLimited(request.headers, 'page')) {
    return new Response('Too many requests\n', {
      status: 429,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
    })
  }
  const origin = escapeXml(getPublicOrigin(request))
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">',
    '  <ShortName>BetterMan</ShortName>',
    '  <Description>Search Unix manual pages on BetterMan</Description>',
    '  <InputEncoding>UTF-8</InputEncoding>',
    `  <Image width="16" height="16" type="image/x-icon">${origin}/favicon.ico</Image>`,
    `  <Url type="text/html" method="get" template="${origin}/search?q={searchTerms}"/>`,
    `  <Url type="application/x-suggestions+json" method="get" template="${origin}/api/v1/suggest?q={searchTerms}&amp;format=opensearch"/>`,
    `  <Url type="application/opensearchdescription+xml" rel="self" template="${origin}/opensearch.xml"/>`,
    `  <moz:SearchForm>${origin}/search</moz:SearchForm>`,
    '</OpenSearchDescription>',
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
