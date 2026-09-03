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

## Search index cost

`manPageSearchDocuments` has a Convex search index over `descNorm`, the one-line NAME description. It is read only when a query does not fill from the name-prefix indexes. Body full-text search was retired because each query scanned the corpus; descriptions are a few dozen characters, so this index stays bounded. If the Convex dashboard shows `queries:search` reading more bytes per call than `queries:listSection`, drop the `search_desc` index before anything else.
