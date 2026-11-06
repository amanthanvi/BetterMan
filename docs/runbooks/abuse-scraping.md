# Abuse / scraping

**Symptoms**

- Sudden RPS spike, especially to `/api/v1/search`.
- High 429 counts, high cache miss rates, rising infra cost.

**Immediate checks**

- Top IPs / user agents (aggregate only; do not store full query text).
- Request distribution by route.
- Cache headers present (ETag + Cache-Control) and honored.

The project is excluded from Observability Plus to save cost (see Build cost controls in `vercel-ops.md`). That leaves one day of runtime logs and no Query breakdown by IP, user agent, or route. Start from Firewall events. If you need those breakdowns, re-include the project under **Billing → Observability Plus → Manage projects** for the incident. It bills $1.20 per million events, and BetterMan generates about three events per request.

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

## Chromium fingerprint challenge (2026-11-06, review by 2026-11-20)

The custom rule `Cost guard: challenge Chromium JA4 cb7bf5808d99 (review 2026-11-20)` (id `rule_probe_ja4_QjDurB`) sits last, after the four #388 bypass rules. Text and OpenSearch reads therefore never reach it. It **challenges** a request when both conditions hold:

- JA4 digest equals `t13d1517h2_8daaf6152771_cb7bf5808d99`.
- User-Agent does not contain `bot`.

That digest is a common Chromium TLS handshake, not a scraper-only signature: FoxIO's JA4 README uses it as its Chrome example. Real Chromium browsers and headless Chromium both present it. Keep the action at challenge. Never deny, and never add a persistent action, because both would block real visitors on shared residential IPs.

Why challenge it here:

- On BetterMan, real browser visits mostly arrive as `t13d1516h2_8daaf6152771_d8a2da3f94cd`: 3,349 of 3,415 Web Analytics beacons on 2026-11-04 and 11-05.
- `cb7bf5808d99` sent about 500 requests a day until 11-02. It then sent 30K, 61K and 132K on 11-03 to 11-05, with 8 beacons in total.
- Its User-Agents rotated across Chrome 150–154, from residential ISPs in many countries.
- 73% of those requests got the app's 429. Each one still cost a proxy invocation, Fluid CPU and a Convex rate-limit call.

Limits:

- A challenge needs a browser that runs JavaScript, and a solved challenge lasts one hour.
- A visitor with JavaScript disabled who presents this fingerprint cannot open HTML pages, though the text routes stay open.
- Requests stopped by the challenge incur no CDN Requests or Fast Data Transfer. Requests that pass it count as normal usage.
- Bot conditions (`bot_name`, `bot_category`, `bot_status`) need a Priority project, and the API answers 402. The User-Agent condition is therefore a deliberate compatibility exemption for the crawlers seen on this fingerprint (DuckDuckBot, ShapBot). It is not identity verification: a scraper that adds `bot` to its User-Agent passes this rule. If app 429s on man pages climb again, re-identify the source.

Checks:

- The Firewall events API returned no data for this project, so watch the rule under **Firewall → Overview**.
- 24 hours after enabling the challenge, compare Web Analytics events with the 2026-11-05 baseline of 3,280. A clear drop means real visitors are being challenged; set the rule to log.
- By 2026-11-20, if matches have stayed near the 500-a-day baseline, set the rule inactive.
- To roll back at any time, set the rule inactive or to log under **Firewall → Configure**, or re-activate an earlier configuration version.

If the scraper changes fingerprint, group allowed traffic by **JA4 Digest** in the Firewall monitoring view (the last 24 hours). Alternatively, briefly re-include the project in Observability Plus and query `client_ja4_digest`. Compare Web Analytics beacons per request rather than raw counts: the busiest fingerprint can be a mainstream browser.

## Search index cost

`manPageSearchDocuments` has a Convex search index over `descNorm`, the one-line NAME description. It is read only when a query does not fill from the name-prefix indexes. Body full-text search was retired because each query scanned the corpus; descriptions are a few dozen characters, so this index stays bounded. If the Convex dashboard shows `queries:search` reading more bytes per call than `queries:listSection`, drop the `search_desc` index before anything else.
