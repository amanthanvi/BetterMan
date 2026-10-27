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

`429` plus `x-vercel-mitigated: challenge` is a Vercel challenge, not the app's
rate-limit response. Anonymous GET probes from the implementation environment on
2026-10-26 observed it on `/man/tar/1`, `/tar.txt`, `/man/tar/1.txt`,
`/opensearch.xml`, and `/api/v1/suggest?name=ta`; HEAD probes also observed it on
`/robots.txt`. The header does not identify its source.
In the project's **Firewall → Observability/Events**, inspect a matching request's
action and rule/ruleset; then check custom rules, the Bot Protection managed
ruleset, and **Bot Management → Attack Mode**. Record the source before changing
protection. No production setting was inspected or changed for this implementation.

Vercel runs this protection before Next.js. Neither Next config nor `vercel.json`
can express the required exemption: Vercel's [custom rule documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)
explicitly excludes `bypass` from the Firewall actions supported in `vercel.json`.
An authorized operator must apply the following in **Firewall → Configure →
Add New… → Rule**, above custom challenge rules. Each row is one rule with its
method and path conditions combined with **AND**, and action **Bypass**:

| Rule | Method | Request Path |
| --- | --- | --- |
| Manual reads | Is any of `GET`, `HEAD` | Starts with `/man/` |
| Root text reads | Is any of `GET`, `HEAD` | Matches expression `^/[^/]+\.txt$` |
| OpenSearch descriptor | Is any of `GET`, `HEAD` | Equals `/opensearch.xml` |
| OpenSearch suggestions | Is any of `GET`, `HEAD` | Equals `/api/v1/suggest` |

The text expression matches one root segment, including `/robots.txt`, not
`/a/b.txt`. The `/man/` rule includes nested manual routes such as OG images.
Do not exempt all of `/api/`, or select clients by a spoofable User-Agent.
Custom bypass skips subsequent custom and managed WAF rules, so retain separate
abusive-IP blocks **before** these rules. Review and publish only after checking
the affected source; see [rule conditions](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)
and [managed ruleset ordering](https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets).

If **Attack Mode** produces the challenge, the [Attack Mode documentation](https://vercel.com/docs/vercel-firewall/attack-mode)
does not establish that a custom WAF bypass overrides it. Confirm path-exemption
support with Vercel before relying on these rules; retain request IDs and
timestamps for Support if attribution is unclear. Do not turn off global
protection as a substitute for a verified path exemption.

Keep application limits enabled: manual HTML, plain text, OG images and the
descriptor use the shared `page` bucket (300 requests/IP/minute); suggestions use
`search` (60/IP/minute). Vercel must control ingress and overwrite
`x-vercel-forwarded-for`: the app trusts that header wherever it runs. Ordinary
forwarding headers are ignored; without the Vercel header, requests share the
anonymous bucket. Do not expose a direct origin that lets clients supply it.
The text response is `private, no-cache` so an edge cache cannot bypass its limit; its document
payload uses the same one-hour cache as HTML. The robots API disallow remains.

After publishing, verify anonymous GET **and** HEAD without challenge cookies on
`/man/tar/1`, `/tar.txt`, `/man/tar/1.txt`, `/opensearch.xml`, and
`/api/v1/suggest?q=ta&format=opensearch`. Expect no mitigation header, text/plain
for `.txt`, and a suggestion list containing `tar`. Check a missing manual is 404
and app limits still return 429 without `x-vercel-mitigated`. Finally, in real
Chrome and Firefox on production, add BetterMan as a search engine from its
OpenSearch descriptor and type `ta` to verify suggestions. Local E2E covers the
descriptor and suggestion HTTP contract; it does not prove browser registration
or a production Firewall exemption.

## Search index cost

`manPageSearchDocuments` has a Convex search index over `descNorm`, the one-line NAME description. It is read only when a query does not fill from the name-prefix indexes. Body full-text search was retired because each query scanned the corpus; descriptions are a few dozen characters, so this index stays bounded. If the Convex dashboard shows `queries:search` reading more bytes per call than `queries:listSection`, drop the `search_desc` index before anything else.
