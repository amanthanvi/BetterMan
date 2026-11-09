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

The custom rule `Cost guard: challenge Chromium JA4 cb7bf5808d99 (review 2026-11-20)` (id `rule_probe_ja4_QjDurB`) sits after the four #388 bypass rules, followed by the deny rule and the tripwire in the next two sections. Text and OpenSearch reads therefore never reach it. It **challenges** a request when both conditions hold:

- JA4 digest equals `t13d1517h2_8daaf6152771_cb7bf5808d99`.
- User-Agent does not contain `bot`.

That digest is a common Chromium TLS handshake, not a scraper-only signature: FoxIO's JA4 README uses it as its Chrome example. Real Chromium browsers and headless Chromium both present it: on 2026-11-08 Chrome 157 presented it on its first TLS connection and `t13d1518h2_8daaf6152771_e2d80978ab2e` on resumed ones, so current Chrome meets this challenge on first contact and passes it automatically. Keep the action at challenge. Never deny, and never add a persistent action, because both would block real visitors on shared residential IPs.

Why challenge it here:

- `cb7bf5808d99` sent about 500 requests a day until 11-02. It then sent 30K, 61K and 132K on 11-03 to 11-05, but only 8 of the 3,415 Web Analytics beacons recorded on 11-04 and 11-05.
- 3,349 of those beacons came from `t13d1516h2_8daaf6152771_d8a2da3f94cd`. They fell on a day when total beacons jumped from a few hundred to about 3,300, so they are not proof of where real visitors arrive. On 11-07 and 11-08 that digest turned out to be mostly automation; see the next section.
- Its User-Agents rotated across Chrome 150–154, from residential ISPs in many countries.
- 73% of those requests got the app's 429. Each one still cost a proxy invocation, Fluid CPU and a Convex rate-limit call.

Limits:

- A challenge needs a browser that runs JavaScript, and a solved challenge lasts one hour.
- A visitor with JavaScript disabled who presents this fingerprint cannot open HTML pages, though the text routes stay open.
- Challenged API routes work only within a valid session. A visitor on this fingerprint who keeps a tab open past the hour gets a 403 from `/api/v1/search` and the licenses lookup until the page reloads. `/api/v1/suggest` is bypassed.
- Requests stopped by the challenge incur no CDN Requests or Fast Data Transfer. Requests that pass it count as normal usage.
- Bot conditions (`bot_name`, `bot_category`, `bot_status`) need a Priority project, and the API answers 402. The User-Agent condition is therefore a deliberate compatibility exemption for the crawlers seen on this fingerprint (DuckDuckBot, ShapBot). It is not identity verification: a scraper that adds `bot` to its User-Agent passes this rule. If app 429s on man pages climb again, re-identify the source.
- Custom rules run before the managed rulesets, so this challenge applies before Bot Protection's verified-agent allowance. A verified agent on this fingerprint whose User-Agent lacks `bot`, such as Perplexity-User or Lighthouse, is challenged.

Checks:

- The Firewall events API reports only per-IP system actions, so watch the rule under **Firewall → Traffic**: choose it in the filter menu. Without Observability Plus the view covers the past day. Longer ranges open a prompt to include the project in Plus; cancel it.
- Total Web Analytics cannot show harm from this rule: the fingerprint sent 8 of 3,415 beacons, and the 2026-11-05 total was a one-day spike. Read the rule's challenge outcomes instead. The Traffic view's legend shows only Challenged; the split comes from the query that view sends to `/api/observability-api/v1/metrics` (metric `vercel.firewall_action.count`, grouped by `wafAction`), which returns `challenge`, `challenge-solved` and `challenge-failed`. Mostly failed or unanswered challenges mean automation. Many solved challenges mean something that runs JavaScript presents this fingerprint, which can be headless automation (the next section's scraper solved 16,470 Bot Protection challenges in a day). Set the rule to log only with evidence of real visitors as well: volume near the site's usual few hundred page views a day, User-Agents that match the fingerprint's real Chrome versions, and `/favicon.svg` fetched far less often than pages. On 2026-11-08 the past day showed 60,810 challenged, 4 solved and 0 failed, so the challenge stayed.
- By 2026-11-20, if matches have stayed near the 500-a-day baseline, set the rule inactive.
- To roll back at any time, set the rule inactive or to log under **Firewall → Configure**. Re-activating an earlier configuration version also undoes every later change, including the deny rule below, so compare it with the active configuration first.

If the scraper changes fingerprint, group allowed traffic by **JA4 Digest** in the Firewall monitoring view (the last 24 hours). Alternatively, briefly re-include the project in Observability Plus and query `client_ja4_digest`. Vercel allows 5 enables per project per week; a sixth answers 429 until the week resets. Compare Web Analytics beacons per request rather than raw counts: the busiest fingerprint can be a mainstream browser.

## Impossible User-Agent deny (2026-11-08, review by 2026-11-20)

The custom rule `Cost guard: deny impossible UAs on Chromium JA4 d8a2da3f94cd (review 2026-11-20)` (id `rule_cost_guard_deny_impossible_u_as_on_chromium_ja_4_d8a2da3f94cd_re_M1k7vJ`) sits after the challenge rule above, followed only by the tripwire in the next section. It **denies** a request when all three conditions hold:

- JA4 digest equals `t13d1516h2_8daaf6152771_d8a2da3f94cd`.
- User-Agent matches `Firefox/|Chrome/(1[0-2][0-9]|[1-9]?[0-9])\.`: Firefox, or Chrome 129 and older.
- User-Agent does not contain `bot`.

The digest alone is a mainstream Chrome handshake (real Chrome 146 presents it), so the rule never denies on the digest. It denies only User-Agents that this TLS stack cannot send: Firefox sends its own cipher list (17 ciphers, hash `5b57614c22b0`), and public JA4 sources tie this digest to Chrome 132–149, after Chrome's ALPS codepoint change. Chrome 129 and older send the older digests `02713d6af862` or `b1ff8ab2d16f`. A real visitor matches only if their browser presents a current Chromium handshake while claiming to be Firefox or an old Chrome, which takes a User-Agent switcher.

Vercel's `re` operator matches anywhere in the value, not the whole value. On 2026-11-08 a temporary deny rule with this regex, scoped to a random User-Agent token, answered 403 to Firefox 121, Chrome 118 and 120 and Edge 119 User-Agents, and let Chrome 146 and 153 through. The rule was then removed.

Why deny here:

- On 11-07 and 11-08 the digest sent about 178K requests a day from residential ISPs in many countries (VNPT, PTCL, Jio, Turk Telekom). Its User-Agents rotated through Chrome 118–120, Firefox 120–121 and Chrome 146. Other modern Chrome versions sent about 300 requests a day.
- It solved Bot Protection's challenge: 16,470 of the day's 16,540 solves. Another challenge would not stop it.
- It fetched `/favicon.svg` and `/sw.js` on nearly every page view (about 29K each, beside 29K Web Analytics beacons), so it opens each page in a fresh browser profile. `proxy.ts` ran on both files, so each fetch also cost an invocation; since 2026-11-08 its matcher skips them and `next.config.ts` sets their security headers, with a worker CSP that keeps `connect-src 'self'` on `/sw.js`. Those beacons are fake page views: Web Analytics events rose from 5.7K on 11-06 to 26.5K on 11-07.
- Function Invocations rose from 82.7K on 11-06 to 191.7K on 11-07, and team spend from $1.27 to $2.17 a day.
- A dry run over the 24 hours before the rule went live matched 149,173 of the digest's 177,564 requests (84%).

Limits:

- Its Chrome 146 User-Agent (about 25.5K requests a day, Windows and Linux) was almost entirely its service worker fetching `/sw.js`: page loads carried the spoofed User-Agent, but the service worker sent the browser's real one. Denying the page loads stops those fetches too, so the rule leaves Chrome 146 alone; real Chrome 146 visitors present this digest. Do not widen the regex to Chrome versions that this fingerprint really sends.
- If the scraper switches to current User-Agents, this rule stops matching. The tripwire below catches it if it keeps overriding its User-Agent without client hints; otherwise re-identify it as in the previous section.
- As with the challenge rule, the `bot` exemption is not identity verification.
- Never add a persistent action.

Checks:

- Under **Firewall → Traffic**, choose the rule and read its User-Agents. Every denied User-Agent should be Firefox or Chrome 129 or older. If Chrome 130 or newer appears, or anything else suggests real visitors, set the rule to log.
- By 2026-11-20, if the rule's denies have stayed near zero for a week, set it inactive.
- To roll back, set the rule inactive or to log under **Firewall → Configure**. Do not re-activate an older configuration version for this: it also undoes every later change.

## Client-hints tripwire (2026-11-08, review by 2026-11-20)

The custom rule `Tripwire: log Chromium TLS + desktop Chrome UA without client hints (review 2026-11-20)` (id `rule_tripwire_log_chromium_tls_desktop_chrome_ua_without_client_hints_97FSXl`) sits last. It **logs** a request when all five conditions hold:

- JA4 digest contains `_8daaf6152771_`, the Chromium cipher list, on fresh and resumed connections alike.
- User-Agent contains `Chrome/`.
- The `sec-ch-ua` header is absent.
- User-Agent does not match `Mobile|Android`.
- User-Agent does not match `bot|compatible|Lighthouse`.

Desktop Chromium always sends `sec-ch-ua`. Automation that sets its User-Agent through the DevTools protocol (`Network.setUserAgentOverride`) without client-hint metadata sends none of the `sec-ch-ua*` headers, whatever version it claims. On 2026-11-08 a local Chrome 157 sent the hints natively and with an override that carried metadata, and sent none with an override that did not, on the document and its subresources. So the tripwire catches a scraper that rotates to current User-Agents, which the deny rule above cannot. Mobile User-Agents are exempt because in-app browsers that replace their User-Agent may drop the hints. Declared crawlers and tools are exempt too.

Live test the same day: in a solved-challenge session, the rule logged a local Chrome's desktop requests without hints, and ignored its mobile requests without hints and its desktop requests with hints. curl's non-Chromium handshake did not match.

Limits:

- Automation that sets client-hint metadata with its override, or runs an unmodified browser, passes.
- Vercel records only a request's final action, so the log shows only requests that no later rule or managed ruleset challenges or denies. The deny rule above runs first, so the tripwire sees what that rule misses.
- A developer who overrides the User-Agent in DevTools without client hints matches, and so does an automated run that sets a custom User-Agent without client-hint metadata (a bare CDP override, Puppeteer's `setUserAgent(ua)`).

Checks:

- Under **Firewall → Traffic**, choose the rule and read its User-Agents, fingerprints, networks and paths. Set it to deny only when it has logged a real sample that is clearly the scraper (many residential networks, User-Agents rotating, `/sw.js` or `/favicon.svg` about as often as pages) and nothing that looks like a real visitor (a few IPs browsing ordinary pages, an in-app browser, a declared tool). With no matches, or too few to judge, it stays at log. Scheduled checks on 2026-11-09 and 2026-11-20 apply this test.
- Once it denies, set it back to log if a real visitor appears among its matches.
- To roll back, set the rule inactive or to log under **Firewall → Configure**.

## Search index cost

`manPageSearchDocuments` has a Convex search index over `descNorm`, the one-line NAME description. It is read only when a query does not fill from the name-prefix indexes. Body full-text search was retired because each query scanned the corpus; descriptions are a few dozen characters, so this index stays bounded. If the Convex dashboard shows `queries:search` reading more bytes per call than `queries:listSection`, drop the `search_desc` index before anything else.
