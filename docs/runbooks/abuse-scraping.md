# Abuse / scraping

**Symptoms**

- Sudden RPS spike, especially to `/api/v1/search`.
- High 429 counts, high cache miss rates, rising infra cost.

**Immediate checks**

- Top IPs / user agents (aggregate only; do not store full query text).
- Request distribution by route.
- Cache headers present (ETag + Cache-Control) and honored.

**Mitigations**

- Tighten rate limits (search stricter than page fetch).
- Block abusive IPs at the edge (preferred) or at app layer (temporary).
- Consider adding a low-cost proof-of-work / challenge at edge if sustained.

**Follow-ups**

- Re-evaluate default UI debounce and paging behavior.
- Add alerts for unusual traffic patterns.

## Non-browser reads and Vercel challenges (#388)

`429` plus `x-vercel-mitigated: challenge` identifies a Vercel challenge, not an
app rate-limit response. **Identify the challenge source in Firewall events
before applying exemptions**: inspect the matched custom rule, managed ruleset,
or Attack Mode setting. On 2026-10-30 the source was the managed Bot Protection
ruleset (action: challenge). The four rules below are live, placed after the
`Cost guard: API rate limit` custom rule. A bypass skips every later rule, so
putting it after the rate limit keeps that limit on `/api/v1/suggest`.

Vercel's [Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode) and
[bot protection](https://vercel.com/docs/bot-management) already let verified bots
through automatically. This includes verified answer/search agents such as
GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User,
PerplexityBot, Perplexity-User and Google-Extended; a claimed User-Agent alone is
not verification. Keep Bytespider and CCBot disallowed in robots.txt. Answer
engines and other crawlers retain the public policy with `/api/` disallowed.

The minimal exemption set is four custom Firewall **Bypass** rules. Combine each
path condition with **Method is any of GET, HEAD**. Keep abusive-IP blocks first,
then these rules before challenge rules; bypass skips subsequent custom and
managed WAF rules:

| Rule | Request Path |
| --- | --- |
| Root text, including robots.txt | Matches expression `^/[^/]+\.txt$` |
| Canonical text manuals | Matches expression `^/man/[^/]+/[^/]+\.txt$` |
| OpenSearch descriptor | Equals `/opensearch.xml` |
| OpenSearch suggestions | Equals `/api/v1/suggest` |

Apply through **Firewall → Configure → Add New… → Rule**. [Custom rule docs](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)
exclude `bypass` from `vercel.json`; Next config cannot exempt traffic challenged
before Next runs. If Attack Mode is the source, confirm the narrow exemptions
work before relying on them; do not disable global protection as a workaround.

Do **not** add a broad `/man/` HTML bypass. HTML retains per-request CSP nonces;
an HTML bypass plus edge rate limiting is deferred until the man-page redesign
brings edge caching. Text shares the HTML section payload cache and the page
API's public response caching (one-hour shared TTL), with the existing page
limit at origin (300/IP/minute). Suggestions keep their search limit
(60/IP/minute). The static OpenSearch descriptor needs no Convex rate-limit call.
Vercel must overwrite `x-vercel-forwarded-for` at ingress; the app trusts it.
Without it, requests share the anonymous bucket.

Sitemap discovery remains in robots.txt: `/sitemap.xml` indexes per-distro and
chunk sitemaps (`/sitemap-debian.xml`, `/sitemap-debian-1.xml`, and peers). Verified
search bots retain access through existing bot protection. Sitemaps are outside
this minimal anonymous Bypass set; investigate any verified-bot failures in
Firewall events rather than widening the rules.

After publishing, check anonymous GET/HEAD on `/tar.txt`, `/tar.1.txt`,
`/man/tar/1.txt`, `/opensearch.xml`, and
`/api/v1/suggest?q=ta&format=opensearch` without challenge cookies. Check text
content type/nosniff, missing-page 404s, origin rate limits and their security
headers, and suggestion results containing `tar`. Verify HTML and sitemaps using
a verified-bot request, not just a spoofed User-Agent. Finally add BetterMan as a
search engine in real Chrome and Firefox on production and type `ta`. Local E2E
proves the HTTP contract, not production exemptions or browser registration.

## Search index cost

`manPageSearchDocuments` has a Convex search index over `descNorm`, the one-line NAME description. It is read only when a query does not fill from the name-prefix indexes. Body full-text search was retired because each query scanned the corpus; descriptions are a few dozen characters, so this index stays bounded. If the Convex dashboard shows `queries:search` reading more bytes per call than `queries:listSection`, drop the `search_desc` index before anything else.
