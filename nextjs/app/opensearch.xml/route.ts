// OpenSearch descriptor: lets browsers offer BetterMan as an address-bar
// search engine ("betterman<Tab>tcpdump").
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>BetterMan</ShortName>
  <Description>Search Unix man pages</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" method="get" template="https://betterman.sh/search?q={searchTerms}"/>
</OpenSearchDescription>
`
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
